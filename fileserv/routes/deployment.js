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
        // TODO: Confirm here that deployment is indeed possible and logical?
        // When/where else could the user know the status?

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
            // TODO: is await necessary if not needed to wait for execution
            // here?
            // TODO: Put package-manager hostname to a constant or other global.
            await deploy(actionId, require("os").hostname() + ":3000");
        }
    }

    response.status(status).send(message);
});

/**
 * Deploy application according to deployment with `actionId`.
 * @param {*} deploymentId The database-id of deployment.
 * @param {*} packageBaseUrl The base of the package manager server address for
 * devices to pull modules from. TODO Define "base" in this context. Currently
 * just called in the post("/")-route with the "localhost:3000" equivalent part
 * but could be e.g. a function taking in a module-ID that constructs the actual URL.
 */
async function deploy(deploymentId, packageBaseUrl) {
    let deployment = await getDb().deployment.findOne({ _id: ObjectId(deploymentId) });

    let selectedModules = [];
    let selectedDevices = [];

                                        // STRING-DELIMITER HACK See /frontend/index.js.
    for (let [device, moduleId, func] of Array.from(deployment.sequence).map(x => x.split(":"))) {
        let module = null;
        if (moduleId != "") {
            module = await getDb().module.findOne({ _id: ObjectId(moduleId) })
            selectedModules.push(module);
        } else {
            // TODO Selecting the module automatically is useless, as they can
            // only do what their exports allow? Meaning that the if-clause will
            // ALWAYS hit (on valid requests).
            // NOTE: Temporary. 
            // 1. Search for a module with the interface/func in its exports.
            let allModules = await getDb().module.find().toArray();
            for (let modulee of allModules) {
                if (modulee.exports.find(x => x === func) !== undefined) {
                    module = modulee;
                    break;
                }
            }
            if (match === null) {
                console.log(`Failed to find function '${JSON.stringify(func)}' from existing modules`);
                return;
            }
            selectedModules.push(module);
        }
    
        if (device != "") {
            selectedDevices.push(await getDb().device.findOne({ _id: ObjectId(device) }));
        } else {
            // 2. Search for a device that could run the module.
            let match = null;
            let allDevices = await getDb().device.find().toArray();
            for (let device of allDevices) {
                if (module.requirements.length === 0 ||
                    module.requirements
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

    // Check that length of all the different lists matches (i.e., for every
    // item in deployment sequence found exactly one module and device).
    let length =
        deployment.sequence.length === selectedModules.length &&
        selectedModules.length     === selectedDevices.length
        ? deployment.sequence.length
        : 0;
    if (length === 0) {
        console.log(`Error on deployment: mismatch length between deployment ${deployment.sequence.length}, modules ${selectedModules.length} and devices ${selectedDevices.length}`);
        return;
    }

    // Create and collect together the instructions and to which devices to send
    // them to.
    for (let i = 0; i < length; i++) {
        let device = selectedDevices[i];
        let module = selectedModules[i];
        // DELIMITER HACK
        let func = deployment.sequence[i].split(":")[2];
        
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
            // TODO: Any way to get base and protocol from express instead of hardcoding?
            url: `http://${packageBaseUrl}/file/module/${module._id}/wasm`,
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
            // FIXME: .local suffix removing hack.
            host: deployment.device.host.substring(0, deployment.device.host.indexOf(".local")),
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