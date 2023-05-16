const http = require('http');

const express = require("express");
const { ObjectId } = require("mongodb");

const { getDb } = require("../server.js");
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
            let err = await createSolution(actionId, PUBLIC_BASE_URI);
            if (err) {
                errorMsg = "Failed constructing manifest for deployment: " + err;
            }
        }
    }

    response
        .status(status)
        .json({
            deploymentId: actionId,
            success: errorMsg ? null : `Manifest ${deploymentName} added`,
            err: errorMsg,
        });
});

/**
 *  Deploy applications and instructions to devices according to a pre-created
 *  deployment.
 */
router.post("/:deploymentId", async (request, response) => {
    let deploymentDoc = await getDb()
        .deployment
        .findOne({ _id: ObjectId(request.params.deploymentId) });

    if (!deploymentDoc) {
        response.status(404).json({"error": `No deployment found for '${request.params.deploymentId}'`});
        return;
    }

    let deploymentSolution = deploymentDoc.fullManifest;

    // Make the requests on each device.
    // POST-making from example snippet at:
    // https://nodejs.org/api/http.html#httprequesturl-options-callback
    for (let [i, [deviceId, manifest]] of Object.entries(deploymentSolution).entries()) {
        // TODO: Use database-reference instead of using device id from field.
        let device = await getDb()
            .device
            .findOne({_id: ObjectId(deviceId)});

        if (!device) {
            response.status(404).json({"error": `No device found for '${deviceId}' in manifest#${i} of deployment '${deploymentDoc.name}'`});
            return;
        }

        let deploymentJson = JSON.stringify(manifest, null, 2);
        // Select where and how to send this particular deployment.
        let requestOptions = {
            method: "POST",
            protocol: "http:",
            host: device.addresses[0],
            port: device.port,
            path: "/deploy",
            headers: {
                "Content-type": "application/json",
                "Content-length": Buffer.byteLength(deploymentJson),
            }
        };

        // TODO: Refactor into promises to await for them in bulk and respond to
        // the top request.
        let req = http.request(
            requestOptions,
            (res) => {
                console.log(`Deployment: Device '${device.name}' responded ${res.statusCode}`);
            }
        );
        req.on("error", e => {
            console.log(`Error while posting to device '${JSON.stringify(device, null, 2)}': `, e);
        })

        req.write(deploymentJson);
        req.end();
    }
    response.json({success: `Deployed '${deploymentDoc.name}'!`});
});

/**
 * Delete all the deployment manifests from database.
 */
router.delete("/", /*authenticationMiddleware,*/ (request, response) => {
    getDb().deployment.deleteMany({}).then(_ => {
        response.status(202).json({ success: "deleting all deployment manifests" }); // Accepted.
    });
});

/**
 * Solve for M2M-call interfaces and create individual instructions
 * (deployments) to send to devices. Save created solution to database attached
 * to the deployment manifest.
 * @param {*} deploymentId The database-id of deployment.
 * @param {*} packageBaseUrl The base of the package manager server address for
 * devices to pull modules from.
 * @returns An error message or null if building and saving the solution was
 * successfull.
 */
async function createSolution(deploymentId, packageBaseUrl) {
    let deployment = await getDb().deployment.findOne({ _id: ObjectId(deploymentId) });

    let updatedSequence = await sequenceFromResources(deployment.sequence);

    // 3. Prepare instructions for the devices in order to have them ...

    // Prepare to make a mapping of devices and their instructions in order to
    // bulk-send the instructions to each device when deploying.
    let deploymentsToDevices = {}
    for (let deviceId of new Set(updatedSequence.map(x => x.device._id))) {
        deploymentsToDevices[deviceId] = {
            // The modules the device needs to download.
            modules: [],
            // The instructions the device needs to follow.
            instructions: [],
        };
    }
    
    // Create and collect together the instructions and to which devices to send
    // them to.
    for (let i = 0; i < updatedSequence.length; i++) {
        let deviceId = updatedSequence[i].device._id;
        let module = updatedSequence[i].module;

        let instruction = instruct(deploymentId, updatedSequence[i], updatedSequence[i + 1] ?? null);

        // Add data needed by the device for pulling a module.
        // NOTE: The download URL for .wasm is passed here.
        let url = new URL(packageBaseUrl);
        url.pathname = `/file/module/${module._id}/wasm`;
        let moduleData = {
            id: module._id,
            name: module.name,
            url: url.toString(),
        };
        // Attach the created details of deployment to matching device.
        deploymentsToDevices[deviceId].modules.push(moduleData);
        deploymentsToDevices[deviceId].instructions.push(instruction);
    }

    let sequenceAsIds = Array.from(updatedSequence)
        .map(x => ({
            device: x.device._id,
            module: x.module._id,
            func: x.func
        }));

    // Do all database updates at once here.
    // Add the composed deployment structure to database for inspecting it later
    // (i.e. during execution or from user interface).
    getDb().deployment.updateOne(
        { _id: deployment._id },
        { $set: { fullManifest: deploymentsToDevices, sequence: sequenceAsIds } },
    );

    return null;
}

/**
 * Based on deployment sequence, confirm the existence (funcs in modules) and
 * availability (devices) of needed resources and select most suitable ones if
 * so chosen.
 * @param {*} sequence List (TODO: Or a graph ?) of calls between devices and
 * functions in order.
 * @returns The same sequence but with intelligently selected combination of
 * resources [[device, module, func]...] as Objects. TODO: Throw errors if fails
 */
async function sequenceFromResources(sequence) {
    let selectedModules = [];
    let selectedDevices = [];

    // Iterate all the items in the request's sequence and fill in the given
    // modules and devices or choose most suitable ones.
    for (let [deviceId, moduleId, funcName]
        of Array.from(sequence)
            .map(x => [x.device, x.module, x.func])
    ) {
        // Selecting the module automatically is useless, as they can
        // only do what their exports allow. So a well formed request should
        // always contain the module-id as well...

        // ...but still, (1.) do a validity-check that the requested module indeed
        // contains the func.
        let modulee = await getDb().module.findOne({ _id: ObjectId(moduleId) })
        if (modulee !== null) {
            if (modulee.exports.find(x => x === funcName) !== undefined) {
                selectedModules.push(modulee);
            } else {
                console.log(`Failed to find function '${funcName}' from requested module:`, modulee);
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
                return `Failed to satisfy module '${JSON.stringify(modulee, null, 2)}': No matching device`;
            }
            selectedDevices.push(match);
        }
    }

    // Check that length of all the different lists matches (i.e., for every
    // item in deployment sequence found exactly one module and device).
    let length =
        sequence.length === selectedModules.length &&
        selectedModules.length     === selectedDevices.length
        ? sequence.length
        : 0;
    // Assert.
    if (length === 0) {
        return `Error on deployment: mismatch length between deployment (${sequence.length}), modules (${selectedModules.length}) and devices (${selectedDevices.length}) or is zero`;
    }

    // Now that the devices that will be used have been selected, prepare to
    // update the deployment sequence's devices in database with the ones
    // selected (handles possibly 'null' devices).
    let updatedSequence = Array.from(sequence);
    for (let i in updatedSequence) {
        updatedSequence[i].device = selectedDevices[i];
        updatedSequence[i].module = selectedModules[i];
        updatedSequence[i].func   = sequence[i].func;
    }

    return updatedSequence;
}

/**
 * Create instructions for `device` to enable calling `func` from a `module` on
 * it. Also according to deployment manifest, specify where the result of
 * executing `func` should be forwarded to (machine-to-machine communication).
 * 
 * NOTE/FIXME: Marks the input objects as prepared by adding the `description`
 * field (hence the 'OUT PARAMETER'), so it will be returned as is. Saving this "flag" identifies if the node
 * has been handled already, but this creates state (previous loop at caller
 * alters the next) and makes this function complicated.
 * @param {*} deploymentId Identification for this particular instruction.
 * Separates between the function-call-chain and just running a particular
 * action "ad hoc".
 * @param {*} from OUT PARAMETER: The node that should enable executing `func` on request.
 * Should contain connectivity information (address and port) and definition of
 * `func` so it can be called with correct inputs.
 * @param {*} to OUT PARAMETER: The next node in line to receive the result `from` action.
 * @returns Object containing needed fields for the device to
 * follow and configure itself (ideally most effortlessly i.e., requiring
 * minimal logic/intelligence on said device).
 */
function instruct(deploymentId, from, to) {
    if (!("description" in from)) {
        from.description = endpointDescription(from);
    }
    if (to !== null) {
        to.description = endpointDescription(to);
    }

    let instruction = {
        // How requests to the configured endpoint should be identified (i.e.
        // forward result to another node or just perform this action once).
        // (NOTE: deployment ID for now),
        actionId: deploymentId,
        // How the device should configure itself.
        configuration: from.description,
        // TODO Where/how does the call-chain end?
        outputTo: to?.description ?? null, 
    };

    return instruction;
}

/**
 * Based on description of a node and `func` that it should execute, put
 * together and fill out information needed for describing the service.
 * @param {*} target OUT PARAMETER: The node containing data for where and how execution of
 * `func` on it should be requested.
 * @returns Pre-filled OpenAPI-doc specially made for this node.
 */
function endpointDescription(target) {
    // Prepare options for making needed HTTP-request to this path.
    // TODO: Check for device availability here?
    // FIXME hardcoded: selecting first address.
    let urlString = target.module.openapi.servers[0].url;
    // FIXME hardcoded: "url" field assumed to be template "http://{serverIp}:{port}/<path base>".
    urlString = urlString.replace("{serverIp}", target.device.addresses[0]);
    urlString = urlString.replace("{port}", target.device.port);
    let url = new URL(urlString);

    // FIXME hardcoded: "paths" field assumed to contain template "/{module}/{func}".
    const mainPathKey = "/{module}/{func}";
    let mainPath = target.module.openapi.paths[mainPathKey];
    // FIXME: URL-encode the names.
    let filledMainPathKey = mainPathKey.replace("{module}", target.module.name)
        .replace("{func}", target.func);

    // Fill out the prepared parts of the templated OpenAPI-doc.
    let preFilledOpenapiDoc = target.module.openapi;
    // Where the device is located.
    // FIXME hardcoded: selecting first address.
    preFilledOpenapiDoc.servers[0].url = url.toString();
    // Calling the func.
    preFilledOpenapiDoc.paths[filledMainPathKey] = mainPath;

    // Remove unnecessary fields.
    // FIXME hardcoded: selecting first address.
    delete preFilledOpenapiDoc.servers[0].variables;
    delete preFilledOpenapiDoc.paths[filledMainPathKey].parameters
    delete preFilledOpenapiDoc.paths[mainPathKey];

    return preFilledOpenapiDoc;
}