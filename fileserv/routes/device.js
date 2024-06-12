const express = require("express");


let deviceDiscovery = null;

let deviceCollection = null;
function setDatabase(db) {
    deviceCollection = db.collection("device");
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
    let devices = await (await deviceCollection.find()).toArray();
    response.json(devices);
};

/**
 * NOTE TEMPORARY route to easily delete all devices from database (in case of
 * hostname-changes etc.)
 */
const deleteDevices = async (request, response) => {
    let { deletedCount } = await deviceCollection.deleteMany();
    response
        .status(200)
        .json({ deletedCount });
}

/**
 * Start a new device scan without waiting for a scanning timeout.
 */
const rescanDevices = (request, response) => {
    deviceDiscovery.startScan();

    response.status(204).send();
}

/**
 * Inform orchestrator about a device.
 * 
 * Supervisors can force registration to the orchestrator by sending a POST
 * request to this endpoint containing the device's information (see `serviceData` below).
 */
const registerDevice = async (request, response) => {
    if (!deviceDiscovery) {
        response.status(500).send("Device discovery not set up.");
        return;
    }

    // Structure post data to match the expected (bonjour) format.
    let serviceData = {
        addresses: request.body.addresses || [request.ip],
        host: request.body.host || request.ip,
        name: request.body.name || request.body.host || request.ip,
        port: request.body.port || 5000,
        protocol: request.body.protocol || "tcp",
        txt: request.body.properties || {
            'path': '/',
            'tls': '0',
        },
        type: 'webthing',
    };

    console.log("Registering device:", serviceData);

    await deviceDiscovery.saveDevice(serviceData);
    response.status(204).send();

}

const router = express.Router();
router.get("/", getDevices);
router.delete("/", deleteDevices);
router.post("/discovery/reset", rescanDevices);
router.post("/discovery/register", registerDevice);

module.exports = { setDatabase, setDeviceDiscovery, router };
