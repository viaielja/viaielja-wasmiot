const http = require('http');

const express = require("express");
const { ObjectId } = require("mongodb");

const { getDb } = require("../server.js");
const utils = require("../utils.js");
const { PUBLIC_BASE_URI } = require("../constants.js");


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
    let errorMsg = null;

    // Ignore deployments with an already existing name.
    // TODO When would a new deployment not be accepted? Based on user credits??
    let doc = await getDb().deployment.findOne({ name: deploymentName });
    if (doc) {
        console.log(`Tried to write existing manifest '${doc.name}' ID ${doc._id}`);
        status = 400;
        errorMsg = `Manifest already exists for deployment ${deploymentName}`;
    } else {
        // TODO: Confirm here that deployment is indeed possible and logical?
        // When/where else could the user know the status?

        // Add the new deployment to database.
        // TODO Only add what is allowed (e.g. _id should not come from POST).
        let result = await getDb().deployment.insertOne(data);
        if (!result.acknowledged) {
            console.log(`Failed adding the manifest: ${err}`);
            status = 500;
            errorMsg = "Failed adding the manifest";
        } else {
            actionId = result.insertedId;
            console.log(`Manifest added to database '${deploymentName}'`);

            //TODO: Start searching for suitable packages using saved file.
            //startSearch();
            // TODO: is await necessary if not needed to wait for execution
            // here?
            await deploy(actionId, PUBLIC_BASE_URI);
        }
    }

    response
        .status(status)
        .json({
            success: errorMsg ? null : `Manifest ${deploymentName} added`,
            err: errorMsg
        });
});

/**
 * Deploy application according to deployment with `actionId`.
 * @param {*} deploymentId The database-id of deployment.
 * @param {*} packageBaseUrl The base of the package manager server address for
 * devices to pull modules from. TODO Define "base" in this context. Currently
 * uses the public address defined with environmental variables (containing the protocol)
 * but could be e.g. a function taking in a module-ID that constructs the actual URL.
 */
async function deploy(deploymentId, packageBaseUrl) {
    let deployment = await getDb().deployment.findOne({ _id: ObjectId(deploymentId) });

    let selectedModules = [];
    let selectedDevices = [];

    // Iterate all the items in the request's sequence and fill in the given
    // modules and devices or choose most suitable ones.
    for (let [deviceId, moduleId, func]
        of Array.from(deployment.sequence)
            .map(x => [x.device, x.module, x.func])
    ) {
        // Selecting the module automatically is useless, as they can
        // only do what their exports allow. So a well formed request should
        // always contain the module-id as well...

        // ...but still, (1.) do a validity-check that the requested module indeed
        // contains the func.
        let modulee = await getDb().module.findOne({ _id: ObjectId(moduleId) })
        if (modulee !== null) {
            if (modulee.exports.find(x => x === func) !== undefined) {
                selectedModules.push(modulee);
            } else {
                console.log(`Failed to find function '${func}' from requested module:`, modulee);
                return;
            }
        } else {
            console.log(`Failed to find module matching the received module ID ${moduleId}`);
            return;
        }
        if (deviceId !== null) {
            let dbDevice = await getDb().device.findOne({ _id: ObjectId(deviceId) });
            if (dbDevice !== null) {
                selectedDevices.push(dbDevice);
            } else {
                console.log(`Failed to find device matching the received device ID ${moduleId}`);
                return;
            }
        } else {
            // 2. Search for a device that could run the module.
            let match = null;
            let allDevices = await getDb().device.find().toArray();
            for (let device of allDevices) {
                if (modulee.requirements.length === 0 ||
                    modulee.requirements
                        .every(x => device.description.supervisorInterfaces.find(y => y == x))
                ) {
                    match = device;
                    break;
                }
            }
            if (match === null) {
                console.log(`Failed to satisfy module '${JSON.stringify(modulee, null, 2)}': No matching device`);
                return;
            }
            selectedDevices.push(match);
        }
    }

    // Check that length of all the different lists matches (i.e., for every
    // item in deployment sequence found exactly one module and device).
    let length =
        deployment.sequence.length === selectedModules.length &&
        selectedModules.length     === selectedDevices.length
        ? deployment.sequence.length
        : 0;
    // Assert.
    if (length === 0) {
        console.log(
            `Error on deployment: mismatch length between deployment (${deployment.sequence.length}), modules (${selectedModules.length}) and devices (${selectedDevices.length}) or is zero`
        );
        return;
    }

    // 3. Send devices instructions for ...

    // Make a mapping of devices and their instructions in order to bulk-send
    // the instructions to each device.
    let deploymentsToDevices = {};
    for (let device of selectedDevices) {
        deploymentsToDevices[device._id] = {
            // The modules the device needs to download.
            modules: [],
            // The instructions the device needs to follow.
            instructions: [],
            // The device's metadata fetched earlier.
            device: device,
        };
    }

    // Create and collect together the instructions and to which devices to send
    // them to.
    for (let i = 0; i < length; i++) {
        let device = selectedDevices[i];
        let module = selectedModules[i];
        let func = deployment.sequence[i]["func"];

        let instruction = {
            // ... 3.1. Waiting for an incoming POST with certain identifier
            // (NOTE: deployment ID for now),
            actionId: deploymentId,
            moduleId: module._id,
            // 3.2. Running a module (function),
            moduleFunc: func,
            // 3.3. POSTing the result to the next device.
            // TODO Where/how does the call-chain end?
            outputTo: selectedDevices[i + 1] ?? null,
        };

        // Add data needed by the device for pulling a module.
        // NOTE: The download URL for .wasm is passed here.
        let moduleData = {
            id: module._id,
            name: module.name,
            url: `${packageBaseUrl}/file/module/${module._id}/wasm`,
        };
        // Attach the created details of deployment to matching device.
        deploymentsToDevices[device._id].modules.push(moduleData);
        deploymentsToDevices[device._id].instructions.push(instruction);
    }

    // Add the composed deployment structure to database for inspecting later.
    getDb().deployment.updateOne(
        { _id: deployment._id },
        { $set: { fullManifest: deploymentsToDevices } },
    );

    // Make the requests on each device.
    // POST-making from example snippet at:
    // https://nodejs.org/api/http.html#httprequesturl-options-callback
    for (let deployment of Object.values(deploymentsToDevices)) {
        let deploymentJson = JSON.stringify(deployment, null, 2);
        // Where and how to send this particular deployment.
        let requestOptions = {
            method: "POST",
            protocol: "http:",
            host: deployment.device.addresses[0],
            port: deployment.device.port,
            path: "/deploy",
            headers: {
                "Content-type": "application/json",
                "Content-length": Buffer.byteLength(deploymentJson),
            }
        };

        let request = http.request(
            requestOptions,
            (response) => {
                console.log(`Deployment: Device '${deployment.device.name}' responded ${response.statusCode}`);
            }
        );
        request.on("error", e => {
            console.log(`Error while posting to device '${JSON.stringify(deployment.device, null, 2)}': ${JSON.stringify(e, null, 2)}`);
        })

        request.write(deploymentJson);
        request.end();
    }
}