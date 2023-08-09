const express = require("express");


let database = null;
let deviceDiscovery = null;

function setDatabase(db) {
    database = db;
}

function setDeviceDiscovery(dd) {
    deviceDiscovery = dd;
}


/**
 * GET list of all available IoT-devices; used by Actors in constructing a
 * deployment.
 */
const getDevices = async (request, response) => {
    // TODO What should this ideally return? Only IDs and descriptions?
    response.json(await database.read("device"));
}

/**
 * NOTE TEMPORARY route to easily delete all devices from database (in case of
 * hostname-changes etc.)
 */
const deleteDevices = (request, response) => {
    database.delete("device", {});
    response
        .status(202) // Accepted.
        .json({ success: "deleting all devices" });
}

/**
 * Start a new device scan without waiting for a scanning timeout.
 */
const rescanDevices = (request, response) => {
    deviceDiscovery.startScan();

    response.status(204).send();
}

const router = express.Router();
router.get("/", getDevices);
router.delete("/", deleteDevices);
router.post("/discovery/reset", rescanDevices);


module.exports = { setDatabase, setDeviceDiscovery, router };
