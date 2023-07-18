const { readFile } = require("node:fs");
const { Router } = require("express");

const { getDb } = require("../server.js");
const { MODULE_DIR } = require("../constants.js");


const router = Router();

// Set where the wasm-binaries will be saved into on the filesystem.
// From: https://www.twilio.com/blog/handle-file-uploads-node-express
const fileUpload = require("multer")({ dest: MODULE_DIR }).single("module");

module.exports = { router };

/**
 * GET a Wasm-module; used by IoT-devices.
 */
router.get("/:moduleId", async (request, response) => {
    // FIXME Crashes on bad _format_ of id (needs 12 byte or 24 hex).
    let doc = (await getDb().read("module", { _id: request.params.moduleId }))[0];
    if (doc) {
        console.log("Sending metadata of module: " + doc.name);
        response.json(doc);
    } else {
        let errmsg = `Failed querying for module id: ${request.params.moduleId}`;
        console.log(errmsg);
        response.status(400).send(errmsg);
    }
});

/**
 * Serve the a file relate to a module based on module ID and file extension.
 */
router.get("/:moduleId/:fileExtension", async (request, response) => {
    let doc = (await getDb().read("module", { _id: request.params.moduleId }))[0];
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
});

/**
 * GET list of all Wasm-modules; used by Actors in constructing a deployment.
 */
router.get("/", async (request, response) => {
    // TODO What should this ideally return? Only IDs and descriptions?
    response.json(await getDb().read("module"));
});

/**
 * Save metadata of a Wasm-module to database and leave information about the
 * concrete file to be patched by another upload-request. This separates
 * between requests with pure JSON or binary bodies.
 */
router.post("/", async (request, response) => {
    // Prevent using the same name twice for a module.
    let exists = (await getDb().read("module", { name: request.body.name }))[0];
    if (exists) {
        console.log(`Tried to write module with existing name: '${request.body.name}'`);
        let errmsg = `Module with name ' ${request.body.name}' already exists`;
        response.status(400).json({ err: errmsg });
        return;
    }

    const moduleId = (await getDb().create("module", [request.body]))
        .insertedIds[0];

    // Wasm-files are identified by their database-id.
    response.status(201).json({ success: "Uploaded module with id: "+ moduleId });
});

/**
 * Attach a file to the previously created module.
 * 
 * In the case of attaching the concrete Wasm-module, `:type` should be "wasm".
 * This saves the binary to the server filesystem and references to it
 * into module's database-entry matching a module-ID given in the body.
 * TODO Could the modules' exports be parsed from Wasm here?
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
router.post("/upload", fileUpload, validateFileFormSubmission, async (request, response) => {
    let filter = { _id: request.body.id };
    let fileExtension = request.file.originalname.split(".").pop();

    /**
     * Helper to update fields in callbacks based on the file extension of upload.
     * @param {*} fields The database fields to update on the module.
     * @returns {*} [ status: status, { err: error | undefined, success: success | undefined } ]
     */
    async function update(fields) {
        let result = await getDb().update("module", filter, fields);
        if (result.acknowledged) {
            let msg = `Updated module '${request.body.id}' with data: ${JSON.stringify(fields, null, 2)}`;
            console.log(request.body.id + ": " + msg);
            return [ 200, { success: msg } ];
        } else {
            let msg = "Failed attaching a file to module";
            console.log(msg + ". Tried adding data: " + JSON.stringify(fields, null, 2));
            return [ 500, { err: msg } ];
        }
    }

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
                    console.log("failed compiling Wasm");
                    response.status(500).json({err: `couldn't compile Wasm: ${err}`});
                    return;
                }
                break;
            case "pb":
                // Model weights etc. for an ML-application.
                break;
            default:
                response.status(400).json({ err: `unsupported file extension '${fileExtension}'`});
        }

        // Now actually update the database-document.
        let updateRes = await update(updateObj);
        response.status(updateRes[0]).json(updateRes[1]);
    });
});

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
        // Just get the names of functions(?) for now.
        .filter(x => x.kind === "function")
        .map(x => x.name);
    let exportData =  WebAssembly.Module.exports(wasmModule)
        // Just get the names of functions for now; the
        // interface description attached to created modules is
        // trusted to match the uploaded WebAssembly binary.
        .filter(x => x.kind === "function")
        .map(x => x.name);

    outFields.requirements = importData;
    outFields.exports = exportData;
}

/**
 * Delete all the modules from database (for debugging purposes).
 */
router.delete("/", /*authenticationMiddleware,*/ (request, response) => {
    getDb().delete("module");
    response
        .status(202) // Accepted.
        .json({ success: "deleting all modules" });
});

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
