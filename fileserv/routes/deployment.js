const { Router } = require("express");
const { getDb } = require("../server.js");
const { ObjectId } = require("mongodb");

const router = Router();

module.exports = { router };

/**
 * GET list of packages or the "deployment manifest"; used by IoT-devices.
 */
router.get("/:deploymentId", async (request, response) => {
    // FIXME Crashes on bad _format_ of id (needs 12 byte or 24 hex).
    let doc = await getDb().deployment.findOne({ _id: ObjectId(request.params.deploymentId) });
    if (doc) {
        response.json(doc);
    } else {
        let errmsg = `Failed querying for deployment id: ${request.params.deploymentId}`;
        console.log(errmsg);
        response.status(400).send(errmsg);
    }
});

/**
 * GET list of all deployments; used by Actors in inspecting their deployments.
 */
router.get("/", async (request, response) => {
    // TODO What should this ideally return? Only IDs and descriptions?
    response.json(await getDb().deployment.find().toArray());
});

/**
 * POST a new deployment manifest to add to orchestrator's database.
 * Currently accepts a POST-request with "json" field in the body which in turn
 * corresponds to the actual deployment TODO Separate this function to a
 * separate "/handle_form/deployment"-route.
 */
router.post("/", async (request, response) => {
    let data = request.body["json"] ?? null;
    // TODO Move this handling to match the pattern below.
    if (data === null) {
        response
            .status(400)
            .send("Field 'json' containing the deployment not found in request")
            .end();
        return;
    } else {
        try {
            data = JSON.parse(data);
        } catch (error) {
            response
                .status(400)
                .send(error.message)
                .end();
            return;
        }
    }

    // TODO Deployment validation.

    let deploymentName = data.name;
    let status = 200;
    let message = `Manifest ${deploymentName} added`;

    // Ignore deployments with an already existing name.
    // TODO When would a new deployment not be accepted? Based on user credits??
    let doc = await getDb().deployment.findOne({ name: deploymentName });
    if (doc) {
        console.log(`Tried to write existing manifest: ${JSON.stringify(doc)}`);
        status = 400;
        message = `Manifest already exists for deployment ${deploymentName}`;
    } else {
        // Add the new deployment to database.
        // TODO Only add what is allowed (e.g. _id should not come from POST).
        // TODO Add the whole body not just name.
        let result = await getDb().deployment.insertOne(data);
        if (!result.acknowledged) {
            console.log(`Failed adding the manifest: ${err}`);
            status = 500;
            message = "Failed adding the manifest";
        } else {
            console.log(`Manifest added to database '${deploymentName}'`);

            //TODO: Start searching for suitable packages using saved file.
            //startSearch();
        }
    }

    // TODO Is calling 'end' really necessary?
    response.status(status).send(message).end();
});
