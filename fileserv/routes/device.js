const express = require("express");

const { getDb, resetDeviceDiscovery } = require("../server");


const router = express.Router();

module.exports = { router };

/**
 * GET list of all available IoT-devices; used by Actors in constructing a
 * deployment.
 */
router.get("/", async (request, response) => {
    // TODO What should this ideally return? Only IDs and descriptions?
    response.json(await getDb().read("device"));
});

/**
 * NOTE TEMPORARY route to easily delete all devices from database (in case of
 * hostname-changes etc.)
 */
router.delete("/", (request, response) => {
    getDb().delete("device", {});
    response
        .status(202) // Accepted.
        .json({ success: "deleting all devices" });
});

/**
 * NOTE TEMPORARY route to easily refresh the devices stored in discovery.
 * Natural to use when doing device deletion.
 */
router.post("/discovery/reset", (request, response) => {
    try {
        resetDeviceDiscovery();
    } catch(e) {
        response.status(500).json({ err: e });
    }

    response.json({ success: "Device discovery reset!" });
});