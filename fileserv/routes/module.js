const { readFile } = require("node:fs");
const { Router } = require("express");
const { ObjectId } = require("mongodb");

const { getDb } = require("../server.js");
const utils = require("../utils.js");


const router = Router();

// Set where the wasm-binaries will be saved into on the filesystem.
// From: https://www.twilio.com/blog/handle-file-uploads-node-express
const fileUpload = require("multer")({ dest: utils.MODULE_DIR }).single("module");

module.exports = { router };

/**
 * GET a Wasm-module; used by IoT-devices.
 */
router.get("/:moduleId", async (request, response) => {
    // FIXME Crashes on bad _format_ of id (needs 12 byte or 24 hex).
    let doc = await getDb().module.findOne({ _id: ObjectId(request.params.moduleId) });
    if (doc) {
        console.log("Sending metadata of module: " + doc.humanReadableName);
        response.json(doc);
    } else {
        let errmsg = `Failed querying for module id: ${request.params.moduleId}`;
        console.log(errmsg);
        response.status(400).send(errmsg);
    }
});

/**
 * Serve the WebAssembly binary matching requested module ID.
 */
router.get("/:moduleId/wasm", async (request, response) => {
    let doc = await getDb().module.findOne({ _id: ObjectId(request.params.moduleId) });
    if (doc) {
        console.log("Sending Wasm-file from file-path: " + doc.path);
        // TODO: Should force to use the application/wasm media type like
        // suggested(?) here:
        // https://webassembly.github.io/spec/web-api/#mediaType
        // The resp.sendFile(f) uses application/octet-stream by default.
        let options = { headers: { 'Content-Type': 'application/wasm' } };
        response.sendFile(doc.path, options);
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
    response.json(await getDb().module.find().toArray());
});

/**
 * Save metadata of a Wasm-module to database and leave information about the
 * concrete file to be patched by another upload-request. This separates
 * between requests with pure JSON or binary bodies.
 */
router.post("/", validateModuleFields, async (request, response) => {
    // Prevent using the same name twice for a module.
    let exists = (await getDb().module.findOne({ name: request.body.name }));
    if (exists) {
        console.log(`Tried to write module with existing name: '${request.body.name}'`);
        let errmsg = `Module of name ' ${request.body.name}' already exists`;
        response.status(400).json({ err: errmsg });
        return;
    }

    const moduleId = (await getDb()
            .module
            .insertOne(request.body)
        ).insertedId;

    // Wasm-files are identified by their database-id.
    response
        .send("Uploaded module with id: "+ moduleId);
});

/**
 * Add the concrete Wasm-module to the server filesystem and references to it
 * into database-entry matching a module-ID (created with an earlier request).
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
    let filter = { _id: ObjectId(request.body.id) };

    /**
     * Helper to update fields in callbacks.
     * @param {*} fields The database fields to update on the module.
     */
    async function update(fields) {
        let result = await getDb().module.updateOne(filter, { $set: fields });
        if (result.acknowledged) {
            let msg = `Updated module '${request.file.originalName}' with data: ${JSON.stringify(fields, null, 2)}`;
            console.log(result.upsertedId + ": " + msg);
            response.send(msg);
        } else {
            let msg = "Failed adding Wasm-file to module";
            console.log(msg + ". Tried adding data: " + JSON.stringify(fields, null, 2));
            response.status(500).send(msg);
        }
    }

    // Add additional fields initially from the file-upload and save to
    // database.
    let fields = {
        humanReadableName: request.file.originalname,
        fileName: request.file.filename,
        path: request.file.path,
    };

    // Get the exports and imports directly from the Wasm-binary itself.
    readFile(request.file.path, function (err, data) {
        if (err) {
            console.log("couldn't read Wasm binary from file ", request.file.path, err);
            return;
        };

        WebAssembly.compile(data)
            .then(function(wasmModule) {
                let importData = WebAssembly.Module.imports(wasmModule)
                    // Just get the names of functions(?) for now.
                    .filter(x => x.kind === "function")
                    .map(x => x.name);
                let exportData =  WebAssembly.Module.exports(wasmModule)
                    // Just get the names of functions(?) for now.
                    .filter(x => x.kind === "function")
                    .map(x => x.name);

                fields.requirements = importData;
                fields.exports = exportData;

                // Now actually update the database-document.
                update(fields);
            });
    });
});

/**
 * Delete all the modules from database (for debugging purposes).
 */
router.delete("/", /*authenticationMiddleware,*/ async (request, response) => {
    getDb().module.deleteMany({});
    response.status(202).send(); // Accepted.
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

/**
 * Middleware to check fields on a module upload POST. NOTE: Designed to crash
 * on failure because writing error messages would be too much work for little
 * value at this stage...
 */
function validateModuleFields(request, response, next) {
    if (request.body.exports instanceof Array &&
        request.body.exports.length > 0 &&
        request.body.requirements instanceof Array) {
        next();
    } else {
        console.log("Failed to validate module data");
        response.send("Module missing fields").status(400);
    }
}