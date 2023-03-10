const { Router } = require("express");
const { ObjectId } = require("mongodb");

const { getDb } = require("../server.js");
const utils = require("../utils.js");


const router = Router();

// Set where the wasm-binaries will be saved into on the filesystem.
// From: https://www.twilio.com/blog/handle-file-uploads-node-express
const moduleUpload = require("multer")({ dest: utils.MODULE_DIR }).single("module");

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
 * Read the Wasm-file from form-input and save it to filesystem. Insert its path
 * to database and respond with the URL that serves the newly added Wasm-file.
 */
router.post("/", moduleUpload, validateFileFormSubmission, utils.tempFormValidate, async (request, response) => {
    // Add additional fields from the file-upload and save to database.
    request.body["humanReadableName"] = request.file.originalname;
    request.body["fileName"] = request.file.filename;
    request.body["path"] = request.file.path;

    const moduleId = (await getDb()
            .module
            .insertOne(request.body)
        ).insertedId;

    // Wasm-files are identified by their database-id.
    response
        .send("Uploaded module with id: "+ moduleId);
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