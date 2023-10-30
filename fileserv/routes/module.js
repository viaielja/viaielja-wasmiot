const { readFile } = require("node:fs/promises");
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

class WasmFileUpload {
    constructor(updateObj) {
        this.type = "wasm";
        this.updateObj = updateObj;
    }
}

class MlModelFileUploaded {
    constructor(type, updateObj) {
        this.type = type;
        this.updateObj = updateObj;
    }
}

/**
 *
 * @param {*} moduleId
 * @returns [failCode, module]
 */
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
 * Based on description of a node and functions that it should execute, put
 * together and fill out information needed for describing the service(s).
 * TODO Somehow filter out the unnecessary paths for this deployment that could
 * be attached to the module.
 * @param {*} deploymentId Identification for the deployment the endpoints will
 * be associated to.
 * @param {*} node OUT PARAMETER: The node containing data for where and how
 * execution of functions on it should be requested.
 * Should contain connectivity information (address and port) and definition of
 * module containing functions so they can be called with correct inputs.
 * @returns Pair of the function (index 0) and a pre-filled OpenAPI-doc endpoint
 * (index 1) specially made for this node for configuring (ideally most
 * effortlessly) the endpoint that function is available to be called from.
 */
const endpointDescription = (module) => {
    // TODO ... Merge together into a single OpenAPI doc for __all__
    // the modules' endpoints.

    // Prepare options for making needed HTTP-request to this path.
    // TODO: Check for device availability here?
    // FIXME hardcoded: selecting first address.
    let urlString = node.module.openapi.servers[0].url;
    // FIXME hardcoded: "url" field assumed to be template "http://{serverIp}:{port}".
    urlString = urlString
        .replace("{serverIp}", node.device.communication.addresses[0])
        .replace("{port}", node.device.communication.port);
    let url = new URL(urlString);

    // NOTE: The convention is that "paths" field contains the template
    // "/{deployment}/modules/{module}/<thisFuncName>". In the future, this
    // template and the OpenAPI or other description format should be as
    // internal to orchestrator as possible.
    const funcPathKey = `/{deployment}/modules/{module}/${node.func}`;
    if (!(funcPathKey in node.module.openapi.paths)) {
        throw `func '${node.func}' not found in module's OpenAPI-doc`;
    }
    // TODO: Iterate all the paths.
    let funcPath = node.module.openapi.paths[funcPathKey];
    let filledFuncPathKey = funcPathKey
        .replace("{deployment}", deploymentId)
        .replace("{module}", node.module.name);

    // Fill out the prepared parts of the templated OpenAPI-doc.
    let preFilledOpenapiDoc = node.module.openapi;
    // Where the device is located.
    // FIXME hardcoded: selecting first address.
    preFilledOpenapiDoc.servers[0].url = url.toString();
    // Where and how to call the func.
    preFilledOpenapiDoc.paths[filledFuncPathKey] = funcPath;

    // Remove unnecessary fields.
    // The path has been filled at this point.
    if (preFilledOpenapiDoc.paths[funcPathKey].parameters) {
        delete preFilledOpenapiDoc.paths[funcPathKey].parameters
    }
    // The server host and port are already filled out at this point.
    // FIXME hardcoded: selecting first address.
    if (preFilledOpenapiDoc.servers[0].variables) {
        delete preFilledOpenapiDoc.servers[0].variables;
    }
    // TODO: See above about filtering out unnecessary paths (= based on funcs).
    for (let unnecessaryPath of Object.keys(preFilledOpenapiDoc.paths).filter(x => x.includes("{module}"))) {
        delete preFilledOpenapiDoc.paths[unnecessaryPath];
    }

    return description;
}

/**
 * GET
 * - a single Wasm-module's whole metadata (moduleId)
 * - a single Wasm-module's whole OpenAPI description (moduleId/description)
 * - all available Wasm-modules' metadata (no moduleId)
 */
const getModule = (justDescription) => (async (request, response) => {
    let [failCode, modules] = await getModuleBy(request.params.moduleId);
    if (failCode) {
        console.error(...modules);
        response.status(failCode).json(new utils.Error(modules));
    } else {
        if (justDescription) {
            console.log("Sending description of module: ", modules[0].name);
            // Return the description specifically.
            response.json(modules[0].description)
        } else {
            console.log("Sending metadata of modules: ", modules.map(x => x.name));
            response.json(modules);
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
 * Parse metadata from a Wasm-binary to database along with its name.
 */
const createModule = async (request, response) => {
    // Create the database entry.
    let moduleId;
    try {
        moduleId = (await database.create("module", [request.body]))
            .insertedIds[0];
    } catch (e) {
        response.status(400).json(new utils.Error(undefined, e));
        return;
    }

    // Attach the Wasm binary.
    try {
        let result = await addModuleBinary({_id: moduleId}, request.files[0]);

        response
            .status(201)
            .json(result);
    } catch (e) {
        let err = ["Failed attaching a file to module", e];
        console.error(...err);
        // TODO Handle device not found on update.
        response
            .status(500)
            .json(new utils.Error(...err));
    }
};

const getFileUpdate = async (file) => {
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

    let data;
    try {
        data = await readFile(file.path);
    } catch (err) {
        console.log("couldn't read Wasm binary from file ", file.path, err);
        // TODO: Should this really be considered server-side error (500)?
        response.status(500).json({err: `Bad Wasm file: ${err}`});
        return;
    }

    // Perform actions specific for the filetype to update
    // non-filepath-related metadata fields.
    let result;
    if (fileExtension === "wasm") {
        updateObj["wasm"] = updateStruct;

        try {
            await parseWasmModule(data, updateObj)
        } catch (e) {
            let err = ["failed compiling Wasm", e]
            console.error(...err);
            throw new utils.Error(...err);
        }
        result = new WasmFileUpload(updateObj);
    } else {
        // All other filetypes are to be "mounted".
        updateObj[originalFilename] = updateStruct;
        switch (fileExtension) {
            // Model weights etc. for an ML-application.
            case "pb":
            case "onnx":
                result = new MlModelFileUploaded(fileExtension, updateObj);
                break;
            default:
                let err = `unsupported file extension: '${fileExtension}'`;
                throw new utils.Error(err);
        }
    }

    return result;
}

/**
 * Attach _binary_file (i.e., .wasm) to a module.
 *
 * Saves the file to the server filesystem and references to it into module's
 * database-entry matching a module-ID given in the body.
 */
const addModuleBinary = async (module, file) => {
    let result = await getFileUpdate(file);
    if (result.type !== "wasm") {
        throw new utils.Error("file given as module binary is not a .wasm file");
    }
    let updateObj = result.updateObj;

    let filter = { _id: module._id };
    // Now actually update the database-document, devices and respond to
    // caller.
    await updateModule(filter, updateObj);

    console.log(`Updated module '${JSON.stringify(filter, null, 2)}' with data:`, result.updateObj);

    // Tell devices to fetch updated files on modules.
    await notifyModuleFileUpdate(filter._id);

    return result;
};


/**
 * Attach _data_files (i.e., not .wasm) to a module.
 *
 * Saves the files to the server filesystem and references to them into module's
 * database-entry matching a module-ID given in the body.
 */
const addModuleDataFiles = async (moduleId, files) => {
    let update = { dataFiles: {} };
    for (let file of files) {
        let result = await getFileUpdate(file);
        if (result.type === "wasm") {
            throw new utils.Error("Wasm file not allowed at data file update");
        }
        let [[key, obj]] = Object.entries(result.updateObj);
        update.dataFiles[key] = obj;
    }

    let filter = { _id: moduleId };
    // Now actually update the database-document, devices and respond to
    // caller.
    await updateModule(filter, update);

    console.log(`Updated module '${JSON.stringify(filter, null, 2)}' with data:`, update);

    // Tell devices to fetch updated files on modules.
    await notifyModuleFileUpdate(filter._id);
};

/**
 * Map function parameters to names and mounts to files ultimately creating an
 * OpenAPI description for the module.
 * @param {*} module The module to describe (from DB).
 * @param {{"functionName": { parameters: [ { name: string, type: "integer" |
 * "float" }], mounts: { "a/mount/path": { mediaType: string } }, output: {
 * "aMediaType": schema} }}} functionDescriptions Mapping of function names to
 * their descriptions.
 * @returns An OpenAPI description of the module primarily its functions and
 * mounts.
 */
const moduleDescription = (modulee, functionDescriptions) => {
    /**
     * Create description for a single function.
     * @param {string} funcName
     * @param {{ parameters: [ { type: integer | float | schema }], mounts: { "./some/mount/path": mediaType: string }, output: { "media/type": schema} }} func
     * @returns [functionCallPath, functionDescription]
     */
    function funcPathDescription(funcName, func) {
        let params = func.parameters.map(x => ({
            name: x.name,
            in: "path", // TODO: Where dis?
            description: "Auto-generated description",
            required: true,
            schema: {
                type: x.type
            }
        }));

        let mounts = Object.fromEntries(
            Object.entries(func.mounts)
                .map(([path, mount]) => [
                    path,
                    {
                        type: "string",
                        contentMediaType: mount.mediaType,
                        contentEncoding: "base64"
                    }
                ])
        );

        let funcDescription = {
            summary: "Auto-generated description",
            parameters: params,
            // NOTE: Function-calls are always POST.
            post: {
                tags: [],
                summary: "Auto-generated description",
                parameters: [],
                requestBody: {
                    required: true,
                    content: {
                        "multipart/form-data": {
                            schema: {
                                type: "object",
                                properties: mounts,
                            }
                        }
                    }
                },
                responses: {
                    200: {
                        description: "Auto-generated description",
                        content: func.output
                    }
                }
            }
        };

        return [
            `/{deployment}/modules/${modulee._id}/${funcName}`,
            funcDescription
        ];
    }

    // TODO: Check that the module (i.e. .wasm binary) and description info match.

    let funcPaths = Object.entries(functionDescriptions).map(x => funcPathDescription(x[0], x[1]));
    const description = {
        openapi: "3.1.0",
        info: {
            title: `${modulee.name}`,
            summary: "Calling WebAssembly functions",
            version: "0.0.1"
        },
        tags: [
            {
            name: "WebAssembly",
            description: "Executing WebAssembly functions"
            }
        ],
        servers: [
            {
                url: "http://{serverIp}:{port}",
                variables: {
                    serverIp: {
                        default: "localhost",
                        description: "IP or name found with mDNS of the machine running supervisor"
                    },
                    port: {
                        enum: [
                            "5000",
                            "80"
                        ],
                        default: "5000"
                    }
                }
            }
        ],
        paths: {...Object.entries(funcPaths)}
    };

    return description;
};

const describeModule = async (request, response) => {
    // Save associated files ("mounts") adding their info to the database entry.
    addModuleDataFiles(request.params.moduleId, request.files);

    // Get module from DB after file updates (FIXME which is a stupid back-and-forth).
    let [failCode, [modulee]] = await getModuleBy(request.params.moduleId);
    if (failCode) {
        console.error(...value);
        response.status(failCode).json(new utils.Error(value));
        return;
    }

    // Prepare description for the module based on given info for functions
    // (params & outputs) and files (mounts).
    let functions = {};
    for (let [funcName, func] of Object.entries(request.body).filter(x => typeof x[1] === "object")) {
        functions[funcName] = {
            parameters: Object.entries(func)
                .filter(([k, _v]) => k.startsWith("param"))
                .map(([_k, v]) => ({ name: v.name, type: v.type })),
            mounts: "mounts" in func
                ? Object.fromEntries(
                    func["mounts"]
                        .map(k => ([ k, {
                            // Map files by their form fieldname to this function's mount.
                            mediaType: request.files.find(x => x.fieldname === k).mimetype
                        }]))
                )
                : {},
            output: func.output
        }
    }
    let description = moduleDescription(modulee, functions);

    try {
        await updateModule({ _id: request.params.moduleId }, { description: description });
    } catch (e) {
        let err = ["failed updating module with description", e];
        console.error(...err);
        response.status(500).json(new utils.Error(...err));
        return;
    }
};

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
            throw new utils.Error(`No device found for '${deviceId}' in manifest#${i}'`);
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
router.post(
    "/",
    fileUpload,
    // A .wasm binary is required.
    utils.validateFileFormSubmission,
    createModule,
);
router.post(
    "/:moduleId/upload",
    fileUpload,
    describeModule,
);
router.get("/:moduleId?", getModule(false));
router.get("/:moduleId/description", getModule(true));
router.get("/:moduleId/:filename", getModuleFile);
router.delete("/:moduleId?", /*authenticationMiddleware,*/ deleteModule);

module.exports = { setDatabase, router };
