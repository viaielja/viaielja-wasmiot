const express = require("express");

const utils = require("../utils.js");

let database = null;

function setDatabase(db) {
    database = db;
}

let orchestrator = null;

function setOrchestrator(orch) {
    orchestrator = orch;
}

class DeploymentMigrated {
    constructor(newDeployment) {
        this.newDeployment = newDeployment;
    }
}

/**
 * GET list of packages or the "deployment manifest"; used by IoT-devices.
 */
const getDeployment = async (request, response) => {
    // FIXME Crashes on bad _format_ of id (needs 12 byte or 24 hex).
    let doc = (await database.read(
        "deployment",
        { _id: request.params.deploymentId }
    ))[0];

    if (doc) {
        response.json(doc);
    } else {
        let err = new utils.Error(`Failed querying for deployment id: ${request.params.deploymentId}`);
        console.log(err);
        response.status(400).send(err);
    }
}

/**
 * GET list of all deployments; used by Actors in inspecting their deployments.
 */
const getDeployments = async (request, response) => {
    // TODO What should this ideally return? Only IDs and descriptions?
    response.json(await database.read("deployment"));
}

/**
 * POST a new deployment manifest to add to orchestrator's database.
 */
const createDeployment = async (request, response) => {
    let deployment = request.body;

    // Ignore deployments with an already existing name.
    // TODO When would a new deployment not be accepted? Based on user credits??
    let doc = (await database.read("deployment", { name: deployment.name }))[0];
    if (doc) {
        response
            .status(400)
            .json(new utils.Error(`Deployment name '${deployment.name}' already exists`));
        return;
    }

    try {
        let deploymentId = await orchestrator.solve(deployment);

        response.status(201).json({ id: deploymentId });
    } catch (err) {
        errorMsg = "Failed constructing manifest for deployment" + err;

        console.error(errorMsg, err.stack);

        response
            .status(500)
            .json(new utils.Error(errorMsg));
    }

}

/**
 *  Deploy applications and instructions to devices according to a pre-created
 *  deployment.
 */
const deploy = async (request, response) => {
    let deploymentDoc = (await database
        .read("deployment", { _id: request.params.deploymentId }))[0];

    if (!deploymentDoc) {
        response
            .status(404)
            .json(new utils.Error(`no deployment matches ID '${request.params.deploymentId}'`));
        return;
    }

    try {
        let responses = await orchestrator.deploy(deploymentDoc);

        console.log("Deploy-responses from devices: ", responses);

        response.json({ deviceResponses: responses });
    } catch(e) {
        switch (e.name) {
            case "DeviceNotFound":
                console.error("device not found", e);
                response
                    .status(404)
                    .json(new utils.Error(undefined, e));
                break;
            default:
                let err = ["unknown error while deploying", e];
                console.error(e, e.stack);
                response
                    .status(500)
                    .json(new utils.Error(...err));
                break;
        }
    }
}

/**
 * Delete all the deployment manifests from database.
 */
const deleteDeployments = async (request, response) => {
    await database.delete("deployment");
    response.status(204).send();
}

const migrateWork = async (request, response) => {
    let deploymentFilter = { _id: request.params.deploymentId };
    let doc = (await database.read("deployment", deploymentFilter))[0];
    if (!doc) {
        response
            .status(404)
            .json(new utils.Error("no deployment matches ID"));
    }

    let instructions = request.body;
    let deviceFrom = (
        await database.read("device", { _id: instructions.from })
    )[0];
    let deviceTo = instructions.to
        ? (await database.read("device", { _id: instructions.to }))[0]
        : null;

    // This call will basically create a whole new deployment, as the topology
    // might be totally different after including a new device.
    let updatedDeployment = orchestrator.migrate(doc, deviceFrom, deviceTo);

    let updateRes = await database.update("deployment", deploymentFilter, updatedDeployment);
    if (updateRes.matchedCount === 0) {
        response
            .status(404)
            .json(new utils.Error("no deployment matches ID"));
    } else {
        response
            .json(new DeploymentMigrated(updatedDeployment));
    }
}

const router = express.Router();
router.get("/:deploymentId", getDeployment);
router.get("/", getDeployments);
router.post("/", createDeployment);
router.post("/:deploymentId", deploy);
router.put("/:deploymentId", migrateWork);
router.delete("/", deleteDeployments);


module.exports = { setDatabase, setOrchestrator, router };