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
 * NOTE TEMPORARY route to easily refresh the devices stored in discovery.
 * Natural to use when doing device deletion.
 * TODO Name to "refresh"
 */
const resetDeviceDiscovery = (request, response) => {
    try {
        deviceDiscovery.refresh();
    } catch(e) {
        response.status(500).json({ err: e });
    }

    response.json({ success: "Device discovery reset!" });
}

const router = express.Router();
router.get("/", getDevices);
router.delete("/", deleteDevices);
router.post("/discovery/reset", resetDeviceDiscovery);


module.exports = { setDatabase, setDeviceDiscovery, router };