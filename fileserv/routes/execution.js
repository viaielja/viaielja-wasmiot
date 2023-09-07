const express = require("express");

const { EXECUTION_INPUT_DIR } = require("../constants.js");
const utils = require("../utils.js");


let database = null

function setDatabase(db) {
    database = db;
}

let orchestrator = null

function setOrchestrator(orch) {
    orchestrator = orch;
}

const INPUT_FILE_FIELD = "inputFile";
/**
 * Send data to the first device in the deployment-sequence in order to
 * kickstart the application execution.
 */
const execute = async (request, response) => {
    let deployment = (await database.read("deployment", { _id: request.params.deploymentId }))[0];

    try {
        let args = {}
        args.body = request.body;
        if (request.file) {
            args.files = [request.file.path];
        }
        let startResponse = await orchestrator.schedule(deployment, args);
        if (!startResponse.ok) {
            throw JSON.stringify(await startResponse.json());
        }
        let startResponseJson = await startResponse.json();
        response.json(startResponseJson);
    } catch (e) {
        response
            .status(500)
            .json(new utils.Error("scheduling work failed", e));
    }
}

const fileUpload = utils.fileUpload(EXECUTION_INPUT_DIR, INPUT_FILE_FIELD);


const router = express.Router();
router.post("/:deploymentId", fileUpload, execute);


module.exports = { setDatabase, setOrchestrator, router };