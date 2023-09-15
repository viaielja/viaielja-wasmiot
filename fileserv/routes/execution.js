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
        let execResponse = await orchestrator.schedule(deployment, args);
        if (!execResponse.ok) {
            throw JSON.stringify(await execResponse.json());
        }
        // Recursively seek the end of the execution chain in order respond with
        // the end result of all steps in the executed sequence.
        let tries = 0;
        let depth = 0;
        let statusCode = 500;
        let result = new utils.Error("undefined error");
        while (true) {
            let json;
            try {
                json = await execResponse.json();
            } catch (e) {
                result = new utils.Error("parsing result to JSON failed: " + json.statusText);
                break;
            }

            // TODO: This is just temporary way to check for result. Would be
            // better that supervisor responds with error code, not 200.
            if (json.result) {
                if (json.status !== "error") {
                    // Check if the result is a URL to follow...
                    try {
                        url = new URL(json.result);
                        depth += 1;
                    } catch (e) {
                        // Assume this is the final result.
                        console.log("Result found!", JSON.stringify(json, null, 2));
                        result = json.result;
                        statusCode = 200;
                        break;
                    }
                }
            } else if (json.error) {
                result = new utils.Error(json.error);
                break;
            } else if (json.resultUrl) {
                url = json.resultUrl;
                depth += 1;
            }

            options = { method: "GET" };

            console.log(`(Try ${tries}, depth ${depth}) Fetching result from: ${url}`);
            execResponse = await fetch(url, options);

            if (!execResponse.ok) {
                // Wait for a while, if the URL is not yet available.
                if (execResponse.status == 404 && depth < 10) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } else {
                    result = new utils.Error("fetching result failed: " + execResponse.statusText);
                    break;
                }
            }

            tries += 1;
        }

        response
            .status(statusCode)
            .json(result);
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