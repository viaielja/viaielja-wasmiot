const { readFile } = require("node:fs");
const express = require("express");

const { MODULE_DIR } = require("../constants.js");
const utils = require("../utils.js");


let database = null;

function setDatabase(db) {
    database = db;
}

class ModuleCreated {
    constructor(id) {
        this.id = id;
    }
}

class WasmFileUploaded {
    constructor(exports) {
        this.type = "wasm";
        this.exports = exports;
    }
}

class MlModelFileUploaded {
    constructor(type) {
        this.type = type;
    }
}

const getModuleBy = async (moduleId) => {
    // Common database query in any case.
    let getAllModules = moduleId === undefined;
    let matches;
    try {
        let filter = getAllModules ? {} : { _id: moduleId };
        matches = await database.read("module", filter);
    } catch (e) {
        let err = ["database query failed", e];
        return [false, err];
    }

    if (getAllModules) {
        // Return all modules.
        return [0, matches];
    } else {
        // Return the module identified by given ID.
        if (matches.length === 0) {
            let err = `no matches for ID ${moduleId}`;
            return [404, err];
        } else if (matches.length > 1) {
            let err = `too many matches for ID ${moduleId}`;
            return [500, err];
        } else {
            let doc = matches[0];
            return [0, [doc]];
        }
    }
};

/**
 * GET
 * - a single Wasm-module's whole metadata (moduleId)
 * - a single Wasm-module's whole OpenAPI description (moduleId/description)
 * - all available Wasm-modules' metadata (no moduleId)
 */
const getModule = (justDescription) => (async (request, response) => {
    let [failCode, value] = await getModuleBy(request.params.moduleId);
    if (failCode) {
        console.error(...value);
        response.status(failCode).json(new utils.Error(value));
    } else {
        if (justDescription) {
            console.log("Sending description of module: ", value[0].name);
            // Return the description specifically.
            response.json(value[0].openapi)
        } else {
            console.log("Sending metadata of modules: ", value.map(x => x.name));
            response.json(value);
        }
    }
});

/**
 * Serve the a file relate to a module based on module ID and file extension.
 */
const getModuleFile = async (request, response) => {
    let doc = (await database.read("module", { _id: request.params.moduleId }))[0];
    let filename = request.params.filename;
    if (doc) {
        let fileObj;
        if (filename === "wasm") {
            fileObj = doc.wasm;
        } else {
            fileObj = doc.dataFiles[filename];
        }

        if (!fileObj) {
            response.status(400).json({
                err: `file '${filename}' missing from module '${doc.name}'`
            });
            return;
        }
        console.log(`Sending '${filename}' file from file-path: `, fileObj.path);
        // TODO: A 'datafile' might not be application/binary in every case.
        let options = { headers: { 'Content-Type': filename == "wasm" ? 'application/wasm' : 'application/binary' } };
        response.sendFile(fileObj.path, options);
    } else {
        let errmsg = `Failed querying for module id: ${request.params.moduleId}`;
        console.log(errmsg);
        response.status(400).json({ err: errmsg });
    }
}

/**
 * Save metadata of a Wasm-module to database and leave information about the
 * concrete file to be patched by another upload-request. This separates
 * between requests with pure JSON or binary bodies.
 */
const createModule = async (request, response) => {
    let moduleId;
    try {
        moduleId = (await database.create("module", [request.body]))
            .insertedIds[0];
    } catch (e) {
        response.status(400).json(new utils.Error(undefined, e));
        return;
    }

    // Wasm-files are identified by their database-id.
    response
        .status(201)
        .json(new ModuleCreated(moduleId));
}

/**
 * Attach a file to the previously created module.
 *
 * Saves the file to the server filesystem and references to it into module's
 * database-entry matching a module-ID given in the body.
 *
 * Regarding the use of PATCH https://restfulapi.net/http-methods/#patch says:
 * "-- the PATCH method is the correct choice for partially updating an existing
 * resource, and you should only use PUT if you’re replacing a resource in its
 * entirety."
 *
 * IMO using PATCH would fit this, but as this route will technically _create_ a
 * new resource (the file) (and the method is not supported with
 * multipart/form-data at the frontend), use POST.
 */
const addModuleFile = async (request, response) => {
    let filter = { _id: request.params.moduleId };
    // NOTE: Only regarding one file.
    let file = request.files[0]
    let originalFilename = file.originalname;
    let fileExtension = originalFilename.split(".").pop();

    // Add additional fields initially from the file-upload and save to
    // database.
    let updateObj = {};
    let updateStruct = {
        humanReadableName: originalFilename,
        fileName: file.filename,
        path: file.path,
    };

    readFile(file.path, async function (err, data) {
        if (err) {
            console.log("couldn't read Wasm binary from file ", file.path, err);
            // TODO: Should this really be considered server-side error (500)?
            response.status(500).json({err: `Bad Wasm file: ${err}`});
            return;
        }

        // Perform actions specific for the filetype to update
        // non-filepath-related metadata fields.
        let statusCode = 200;
        let result;
        if (fileExtension === "wasm") {
            updateObj["wasm"] = updateStruct;

            try {
                await parseWasmModule(data, updateObj)
            } catch (e) {
                let err = ["failed compiling Wasm", e]
                console.error(...err);
                statusCode = 500;
                result = new utils.Error(...err);
            }
            result = new WasmFileUploaded(updateObj.exports);
        } else {
            // All other filetypes are to be "mounted".
            updateObj["dataFiles"] = {};
            updateObj["dataFiles"][originalFilename] = updateStruct;
            switch (fileExtension) {
                // Model weights etc. for an ML-application.
                case "pb":
                case "onnx":
                    result = new MlModelFileUploaded(fileExtension);
                    break;
                default:
                    let err = `unsupported file extension: '${fileExtension}'`;
                    statusCode = 500;
                    result = new utils.Error(err);
                    console.error(err);
                    break;
            }
        }

        // Now actually update the database-document, devices and respond to
        // caller.
        try {
            await updateModule(filter, updateObj);

            console.log(`Updated module '${JSON.stringify(filter, null, 2)}' with data:`, updateObj);

            // Tell devices to fetch updated files on modules.
            await notifyModuleFileUpdate(filter._id);
            response
                .status(statusCode)
                .json(result);
        } catch (e) {
            let err = ["Failed attaching a file to module", e];
            console.error(...err);
            // TODO Handle device not found on update.
            response
                .status(500)
                .json(new utils.Error(...err));
        }
    });
}

/**
 * DELETE a single or all available Wasm-modules.
 */
const deleteModule = async (request, response) => {
    let deleteAllModules = request.params.moduleId === undefined;
    let filter = deleteAllModules ? {} : { _id: request.params.moduleId };
    let deletedCount = (await database.delete("module", filter)).deletedCount;
    if (deleteAllModules) {
        response.json({ deletedCount: deletedCount });
    } else {
        response.status(204).send();
    }
}


/**
 * Parse WebAssembly module from data and add info extracted from it into input object.
 * @param {*} data Data to parse WebAssembly from e.g. the result of a file-read.
 * @param {*} outFields Object to add new fields into based on parsed
 * WebAssembly (e.g. module exports etc.)
 */
async function parseWasmModule(data, outFields) {
    // Get the exports and imports directly from the Wasm-binary itself.
    let wasmModule = await WebAssembly.compile(data);

    let importData = WebAssembly.Module.imports(wasmModule)
        // Just get the functions for now.
        .filter(x => x.kind === "function");

    // Each import goes under its module name.
    let importObj = Object.fromEntries(importData.map(x => [x.module, {}]));
    for (let x of importData) {
        // Fake the imports for instantiation.
        importObj[x.module][x.name] = () => {};
    }
    // An instance is needed for more information about exported functions,
    // although not much can be (currently?) extracted (for example types would
    // probably require more specific parsing of the binary and they are just
    // the Wasm primitives anyway)...
    let instance = await WebAssembly.instantiate(wasmModule, importObj);
    let exportData =  WebAssembly.Module.exports(wasmModule)
        // Just get the names of functions for now; the
        // interface description attached to created modules is
        // trusted to match the uploaded WebAssembly binary.
        .filter(x => x.kind === "function")
        .map(x => new Func(x.name, instance.exports[x.name].length));

    outFields.requirements = importData;
    outFields.exports = exportData;
}

/**
* Notify devices that a module previously deployed has been updated.
* @param {*} moduleId ID of the module that has been updated.
*/
async function notifyModuleFileUpdate(moduleId) {
    // Find devices that have the module deployed and the matching deployment manifests.
    let deployments = (await database.read("deployment"));
    let devicesToUpdatedManifests = {};
    for (let deployment of deployments) {
        // Unpack the mapping of device-id to manifest sent to it.
        let [deviceId, manifest] = Object.entries(deployment.fullManifest)[0];

        if (manifest.modules.some(x => x.id.toString() === moduleId)) {
            if (devicesToUpdatedManifests[deviceId] === undefined) {
                devicesToUpdatedManifests[deviceId] = [];
            }
            devicesToUpdatedManifests[deviceId].push(manifest);
        }
    }

    // Deploy all the manifests again, which has the same effect as the first
    // time (following the idempotence of ReST).
    for (let [deviceId, manifests] of Object.entries(devicesToUpdatedManifests)) {
        let device = (await database
            .read("device", { _id: deviceId }))[0];

        if (!device) {
            throw new utils.Error(`No device found for '${deviceId}' in manifest#${i} of deployment '${deploymentDoc.name}'`);
        }

        for (let manifest of manifests) {
            await utils.messageDevice(device, "/deploy", manifest);
        }
    }
}

/**
* Update the modules matched by filter with the given fields.
* @param {*} filter To match the modules to update.
* @param {*} fields To add to the matched modules.
*/
async function updateModule(filter, fields) {
    let updateRes = await database.update("module", filter, fields, false);
    if (updateRes.matchedCount === 0) {
        throw "no module matched the filter";
    }
}

class Func {
    constructor(name, parameterCount) {
        this.name = name;
        this.parameterCount = parameterCount;
    }
}

const fileUpload = utils.fileUpload(MODULE_DIR, "module");


const router = express.Router();
router.post("/", createModule);
router.post("/:moduleId/upload", fileUpload, utils.validateFileFormSubmission, addModuleFile);
router.get("/:moduleId?", getModule(false));
router.get("/:moduleId/description", getModule(true));
router.get("/:moduleId/:filename", getModuleFile);
router.delete("/:moduleId?", /*authenticationMiddleware,*/ deleteModule);

module.exports = { setDatabase, router };
