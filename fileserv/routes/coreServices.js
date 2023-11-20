/**
 * This module contains the routes for "core services" that come with the
 * orchestrator and thus needn't be separately uploaded as modules.
 *
 * Each service is attached with a supervisor-compatible description like any
 * other WebAssembly module on the orchestrator, and is mixed into the module
 * database.
 */

const express = require("express");

const utils = require("../utils.js");
const COLLECTION_NAME = "module";
const {
    FUNCTION_DESCRIPTIONS: DATALIST_FUNCTION_DESCRIPTIONS,
    MODULE_NAME: DATALIST_MODULE_NAME,
    setDatabase: setDatalistDatabase,
    MODULE_NAME
} = require("./datalist.js");
const { DEVICE_DESC_ROUTE, DEVICE_HEALTH_ROUTE } = require("../constants.js");
const { ORCHESTRATOR_WASMIOT_DEVICE_DESCRIPTION } = require("../src/orchestrator.js");
const { createNewModule, describeExistingModule } = require("../routes/module.js");
const { ObjectId } = require("mongodb");


let serviceIds = {};

let database = null;

const nameFor = (serviceName) => `core:${serviceName}`;
/**
 * Calling on the orchestrator API, create the core services as "modules".
 * This should be done right after the orchestrator server has fully
 * initialized.
 */
async function initializeCoreServices() {
    // Delete and refresh all core services at initialization.
    let { deletedCount } = await database.collection("module").deleteMany({ isCoreModule: true });
    console.log(`DEBUG: Deleted existing (${deletedCount}) core services in order to create them anew...`);

    console.log("Initializing the core services...");

    // Initialize the datalist "module".
    let metadata = {
        name: nameFor(DATALIST_MODULE_NAME)
    };
    // Fake the object that multer would create off of uploaded files.
    let files = [
        {
            fieldname: "wasm",
            originalname: "datalist.wasm",
            filename: "empty.wasm",
            path: "./files/empty.wasm",
        }
    ];
    let id = await createNewModule(metadata, files);
    // Describe the datalist "module".
    await describeExistingModule(id, DATALIST_FUNCTION_DESCRIPTIONS, []);

    // Add a flag to the entry to mark it as core-module.
    await database.collection("module").updateOne({ _id: ObjectId(id) }, { $set: { isCoreModule: true } });

    serviceIds[DATALIST_MODULE_NAME] = id;

    console.log("Created core services", Object.entries(serviceIds).map(([name, _]) => name));
}

/**
 * Return list of the core modules that orchestrator provides on its own.
 * @param {*} request
 * @param {*} response
 */
const getCoreServices = async (request, response) => {
    response.json(await database.read("coreServices"));
};

const router = express.Router();
router.get("/core", getCoreServices);
// Advertise and act like a supervisor.
router.get(DEVICE_DESC_ROUTE, (_, response) => {
    response.json(ORCHESTRATOR_WASMIOT_DEVICE_DESCRIPTION);
});
router.get(DEVICE_HEALTH_ROUTE, (_, response) => {
    response.json({ status: "ok" });
});
// Deploy always succeeds, because no setup is needed.
router.post("/deploy", (_, response) => {
    response.status(200).json({ status: "ok" });
});


// Prepare similar routes as on supervisor.
let endpoints = Object.entries(DATALIST_FUNCTION_DESCRIPTIONS)
    .map(
        ([functionName, x]) => ({
            path: utils
                .supervisorExecutionPath(nameFor(MODULE_NAME), functionName)
                .replace("{deployment}", ":deploymentId"),
            method: x.method,
            func: x.func
        })
    );
for (let { path, method, func } of endpoints) {
    router[method.toLowerCase()](path, func);
}

/**
 * Set common dependencies and state for providing core services from
 * orchestrator endpoints like they were any other Wasm-module endpoints.
 */
async function init(routeDependencies) {
    // Database is needed by some services, so they can access it from this
    // variable.
    database = routeDependencies.database;

    setDatalistDatabase(database);

    return router;
}


module.exports = { init, initializeCoreServices };
