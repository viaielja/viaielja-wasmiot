const { readFile } = require("node:fs");
const express = require("express");

const { MODULE_DIR } = require("../constants.js");
const utils = require("../utils.js");


let database = null;

function setDatabase(db) {
    database = db;
}

/**
 * GET a Wasm-module; used by IoT-devices.
 */
const getModule = async (request, response) => {
    // FIXME Crashes on bad _format_ of id (needs 12 byte or 24 hex).
    let doc = (await database.read("module", { _id: request.params.moduleId }))[0];
    if (doc) {
        console.log("Sending metadata of module: " + doc.name);
        response.json(doc);
    } else {
        let errmsg = `Failed querying for module id: ${request.params.moduleId}`;
        console.log(errmsg);
        response.status(400).send(errmsg);
    }
}

/**
 * Serve the a file relate to a module based on module ID and file extension.
 */
const getModuleFile = async (request, response) => {
    let doc = (await database.read("module", { _id: request.params.moduleId }))[0];
    let fileExtension = request.params.fileExtension;
    if (doc) {
        let fileObj = doc[fileExtension];
        if (!fileObj) {
            response.status(400).json({
                err: `file '${fileExtension}' missing from module '${doc.name}'`
            });
            return;
        }
        console.log(`Sending '${fileExtension}' file from file-path: `, fileObj.path);
        // TODO: Should force to use the application/wasm media type like
        // suggested(?) here:
        // https://webassembly.github.io/spec/web-api/#mediaType
        // The resp.sendFile(f) uses application/octet-stream by default.
        let options = { headers: { 'Content-Type': fileExtension == "wasm" ? 'application/wasm' : 'application/binary' } };
        // FIXME: File might not be found at doc.path.
        response.sendFile(fileObj.path, options);
    } else {
        let errmsg = `Failed querying for module id: ${request.params.moduleId}`;
        console.log(errmsg);
        response.status(400).json({ err: errmsg });
    }
}

/**
 * GET list of all Wasm-modules; used by Actors in constructing a deployment.
 */
const getModules = async (request, response) => {
    // TODO What should this ideally return? Only IDs and descriptions?
    response.json(await database.read("module"));
}

/**
 * Save metadata of a Wasm-module to database and leave information about the
 * concrete file to be patched by another upload-request. This separates
 * between requests with pure JSON or binary bodies.
 */
const createModule = async (request, response) => {
    // Prevent using the same name twice for a module.
    let exists = (await database.read("module", { name: request.body.name }))[0];
    if (exists) {
        console.log(`Tried to write module with existing name: '${request.body.name}'`);
        let errmsg = `Module with name ' ${request.body.name}' already exists`;
        response.status(400).json(new utils.Error(errmsg));
        return;
    }

    const moduleId = (await database.create("module", [request.body]))
        .insertedIds[0];

    // Wasm-files are identified by their database-id.
    response.status(201).json(new utils.Success({ message: "Uploaded module with id: "+ moduleId }));
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
    let filter = { _id: request.body.id };
    let fileExtension = request.file.originalname.split(".").pop();

    let updateObj = {}
    // Add additional fields initially from the file-upload and save to
    // database.
    updateObj[fileExtension] = {
        humanReadableName: request.file.originalname,
        fileName: request.file.filename,
        path: request.file.path,
    };

    readFile(request.file.path, async function (err, data) {
        if (err) {
            console.log("couldn't read Wasm binary from file ", request.file.path, err);
            // TODO: Should this really be considered server-side error (500)?
            response.status(500).json({err: `Bad Wasm file: ${err}`});
            return;
        };

        // Perform actions specific for the filetype to update
        // non-filepath-related metadata fields.
        switch (fileExtension) {
            case "wasm":
                try {
                    await parseWasmModule(data, updateObj)
                } catch (err) {
                    console.error("failed compiling Wasm", err);
                    response.status(500).json({err: `couldn't compile Wasm: ${err}`});
                    return;
                }
                break;
            case "pb":
                // Model weights etc. for an ML-application.
                break;
            default:
                response.status(400).json({ err: `unsupported file extension '${fileExtension}'` });
        }

        // Now actually update the database-document.
        try {
            await updateModule(filter, updateObj);

            let msg = `Updated module '${request.body.id}' with data: ${JSON.stringify(updateObj, null, 2)}`;
            let success = new utils.Success({ 
                message: msg,
                type: fileExtension,
                fields: updateObj
            });
            response.status(200).json(success);

            console.log(msg);

            // Tell devices to fetch updated files on modules.
            notifyModuleFileUpdate(request.body.id);
        } catch (err) {
            let msg = "Failed attaching a file to module: " + err;
            response.status(500).json(new utils.Error(msg));

            console.log(msg + ". Tried adding data: " + JSON.stringify(updateObj, null, 2));
        }
    });
}

/**
 * Delete all the modules from database (for debugging purposes).
 */
const deleteModules = (request, response) => {
    database.delete("module");
    response
        .status(202) // Accepted.
        .json({ success: "deleting all modules" });
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
            response.status(404).json(new utils.Error(`No device found for '${deviceId}' in manifest#${i} of deployment '${deploymentDoc.name}'`));
            return;
        }

        for (let manifest of manifests) {
            let deploymentJson = JSON.stringify(manifest, null, 2);
            utils.messageDevice(device, "/deploy", deploymentJson);
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

/**
* Middleware to confirm existence of an incoming file from a user-submitted
* form (which apparently `multer` does not do itself...).
*/
function validateFileFormSubmission(request, response, next) {
    if (request.method !== "POST") { next(); return; }

    // Check that request contains a file upload.
    if (!request.hasOwnProperty("file")) {
        response.status(400).send("file-submission missing");
        console.log("Bad request; needs a file-input for the module field");
        return;
    }
    next();
}
// Set where the wasm-binaries will be saved into on the filesystem.
// From: https://www.twilio.com/blog/handle-file-uploads-node-express
const fileUpload = require("multer")({ dest: MODULE_DIR }).single("module");

class Func {
    constructor(name, parameterCount) {
        this.name = name;
        this.parameterCount = parameterCount;
    }
}

const router = express.Router();
router.get("/:moduleId", getModule);
router.get("/:moduleId/:fileExtension", getModuleFile);
router.get("/", getModules);
router.post("/", createModule);
router.post("/upload", fileUpload, validateFileFormSubmission, addModuleFile);
router.delete("/", /*authenticationMiddleware,*/ deleteModules);


module.exports = { setDatabase, router };
