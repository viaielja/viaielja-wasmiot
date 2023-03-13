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
        // TODO Only respond with the binary, not JSON.
        response.json(doc);
    } else {
        let errmsg = `Failed querying for deployment id: ${request.params.moduleId}`;
        console.log(errmsg);
        response.status(400).send(errmsg);
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
    // Add additional fields from the file-upload and save to database.
    let filter = { _id: ObjectId(request.body.id) };
    let update = {
        $set: {
            humanReadableName: request.file.originalname,
            fileName: request.file.filename,
            path: request.file.path,
        }
    };

    let result = await getDb().module.updateOne(filter, update);
    if (result.acknowledged) {
        let msg = "Added Wasm-file to module";
        console.log(msg + ": " + result.upsertedId);
        response.send(msg);
    } else {
        let msg = "Failed adding Wasm-file to module";
        console.log(msg + ". Tried adding: " + JSON.stringify(update, null, 2));
        response.status(500).send(msg);
    }
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