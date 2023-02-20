const { Router } = require("express");
const { getDb } = require("../server");

const router = Router();

module.exports = { router };

/**
 * GET list of all available IoT-devices; used by Actors in constructing a
 * deployment.
 */
router.get("/", async (request, response) => {
    // TODO What should this ideally return? Only IDs and descriptions?
    response.json(await getDb()().device.find().toArray());
});

/**
 * POST a new device's architecture information (i.e., device description) to
 * add to orchestrator's database.
 */
router.post("/", async (request, response) => {
    // TODO Only add what is allowed (e.g. _id should not come from POST).
    let result = await getDb().device.insertOne(request.body)
    if (result.acknowledged) {
        let msg = "New device added";
        console.log(msg);
        response.send(msg);
    } else {
        let msg = "failed to add the device";
        console.log(msg);
        response.status(500).send(msg);
    }
});
