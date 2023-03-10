const http = require('http');

const express = require("express");
const { ObjectId } = require("mongodb");

const { getDb } = require("../server.js");
const utils = require("../utils.js");


const router = express.Router();

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
 * TODO Separate this function to a separate "/handle_form/deployment"-route.
 */
router.post("/", async (request, response) => {
    let data = request.body;
    // The id of the deployment _after_ added to database. Used to identify
    // received POSTs on devices regarding this deployment.
    let actionId = null;

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
        let result = await getDb().deployment.insertOne(data);
        if (!result.acknowledged) {
            console.log(`Failed adding the manifest: ${err}`);
            status = 500;
            message = "Failed adding the manifest";
        } else {
            actionId = result.insertedId;
            console.log(`Manifest added to database '${deploymentName}'`);

            //TODO: Start searching for suitable packages using saved file.
            //startSearch();
        }
    }

    // NOTE: Temporary. 
    // 1. Search for modules with the interfaces described in deployment's
    // action sequence.
    let matchingModules = [];
    for (let interface of request.body["sequence"]) {
        let match = null;
        for (let modulee of getDb().module.find()) {
            if (modulee.interfaces.find(x => x === interface) !== undefined) {
                match = modulee;
                break;
            }
        }
        if (match === null) {
            status = 400;
            message = `Failed to satisfy interface '${JSON.stringify(interface)}'`;
            console.log(message);
            break;
        }
        matchingModules.push(match);
    }
    
    // 2. Search for devices that could run these modules.
    let selectedDevices = [];
    for (let modulee in matchingModules) {
        let match = null;
        for (let device in getDb().device) {
            if (modulee.constraints.every(x => device.supervisorInterfaces.find(x))) {
                match = device;
                break;
            }
        }
        if (match === null) {
            status = 400;
            message = `Failed to satisfy module '${JSON.stringify(modulee, null, 2)}'`;
            console.log(message);
            break;
        }
        selectedDevices.push(device);
    }

    // 3. Send devices instructions for ...

    let length =
        request.body["sequence"].length === selectedModules.length &&
        selectedModules.length          === selectedDevices.length
        ? request.body["sequence"].length
        : 0;

    // "Zip" the different parts and transform into a separate instructions for
    // devices.
    for (let i = 0; i < length; i++) {
        let device = selectedDevices[i];
        let module = selectedModules[i];
        let func = request.body["sequence"][i];
        
        // POST-making from example snippet at:
        // https://nodejs.org/api/http.html#httprequesturl-options-callback
        let instruction = JSON.stringify({
            // ... 3.1. Waiting for POST,
            actionId: actionId,
            moduleId: module._id,
            // 3.2. Running a module (function),
            moduleFunc: func,
            // 3.3. POSTing the result to the next device.
            // TODO Where/how does the call-chain end?
            outputTo: selectedDevices[i + 1] ?? null,
        });

        let deviceEndpoint = "/action";
        let request = http.request(
            {
                method: "POST",
                protocol: "http:",
                host: device.host,
                port: device.port,
                path: deviceEndpoint,
                headers: {
                    "Content-type": "application/json",
                    "Content-length": Buffer.byteLength(instruction),
                }
            },
            (response) => {
                console.log(`Deployment: Device '${device.name}' responded ${response.statusCode}`);
            }
        );
        request.on("error", e => {
            console.log(`Error while posting to device '${device.name}': ${JSON.stringify(e, null, 2)}`);
            
        })

        request.write(instruction);
        request.end();
    }

    response.status(status).send(message);
});
