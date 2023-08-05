const express = require("express");

const utils = require("../utils.js");
const Orchestrator = require("../src/orchestrator.js");


let database = null

function setDatabase(db) {
    database = db;
}

let orchestrator = null

function setOrchestrator(orch) {
    orchestrator = orch;
}



/**
 * Send data to the first device in the deployment-sequence in order to
 * kickstart the application execution.
 */
const execute = async (request, response) => {
    let deployment = (await database.read("deployment", { _id: request.params.deploymentId }))[0];
    
    try {
        let result = await orchestrator.schedule(deployment, request.body);
        response.json(result);
    } catch (e) {
        response
            .status(500)
            .json(new utils.Error("scheduling work failed", e)); 
    }
}

const router = express.Router();
router.post("/:deploymentId", execute);


module.exports = { setDatabase, setOrchestrator, router };