const http = require('http');

const express = require("express");
const { ObjectId } = require("mongodb");

const { getDb } = require("../server.js");
const utils = require("../utils.js");


const router = express.Router();

module.exports = { router };

/**
 * Send data to the first device in the deployment-sequence in order to
 * kickstart the application execution.
 */
router.post("/:deploymentId", async (request, response) => {
    // 1. get the deployment and other execution related data from db.
    let deployment = await getDb().deployment.findOne({ _id: ObjectId(request.params.deploymentId) });
    // "Node" as in the circle connected to others by edges in a graph.
    let startNodeManifestData = deployment.fullManifest[deployment.sequence[0].device].device;
    let deviceAddress = startNodeManifestData.addresses[0];
    let devicePort = startNodeManifestData.port;
    // Note: these are not taken from the above "manifest data", as the "manifest"
    // is concerned with deployment (i.e., delivering modules and configs, not
    // execution sequence).
    let module = await getDb().module.findOne({ _id: ObjectId(deployment.sequence[0].module) });
    let funcName = deployment.sequence[0].func;

    // 2. prepare given data for sending to device.
    // TODO: First input (if any) should probably have been saved at deployment time.
    // TODO: Will there be horribly complex endianness problems from using raw bytes?
    // The input is raw bytes so that supervisor gets a generic way to pass
    // different types to Wasm functions.
    let input = new Uint8Array(1);
    // Test value for executing fibonacci sequence.
    input[0] = 7;

    // 3. post data to the first device and return its reaction response.
    // TODO: Could device sometimes want to answer back with the execution result?
    utils.callDeviceFunc(
        deploymentId=deployment,
        device={ address: deviceAddress, port: devicePort },
        funcData={ name: funcName, module: module },
        input=input,
        onResponse=function(execResponse) {
            console.log(`Execution: Device '${device.address}' responded ${execResponse.statusCode}`);
            response.json({
                success: `Device at ${deviceAddress}:${devicePort} accepted input to ${module.name}:${funcName}!`
            });
        },
        onError=function(err) {
            console.log(`Error while posting to device '${deviceAddress}':`, err);
            // TODO: What is correct status code here (technically device
            // could have failed, not orchestrator)?
            response.status(500).json({err: err});
        }
    );
});