const constants = require("../constants.js");
const utils = require("../utils.js");


class DeviceNotFound extends Error {
    constructor(dId) {
        super("device not found");
        this.name = "DeviceNotFound";
        this.device = { id: dId };
    }
}

/**
 * Fields for instruction about reacting to calls to modules and functions on a
 * device.
 */
class Instructions {
    constructor() {
        this.modules = {};
    }

    add(moduleId, funcName, instruction) {
        if (!this.modules[moduleId]) {
            this.modules[moduleId] = {};
        }
        // Initialize each function to match to an
        // instruction object.
        this.modules[moduleId][funcName] = instruction;
    }
}

/**
 * Struct for storing information that a single node (i.e. a device) needs for
 * deployment.
 */
class DeploymentNode {
    constructor(deploymentId) {
        // Used to separate similar requests between deployments at
        // supervisor.
        this.deploymentId = deploymentId;
        // The modules the device needs to download.
        this.modules = [];
        // Descriptions of endpoints that functions can be called from and
        // that are needed to set up on the device for this deployment.
        this.endpoints = {};
        // The instructions the device needs to follow the execution
        // sequence i.e., where to forward computation results initiated by
        // which arriving request.
        this.instructions = new Instructions();
    }
}

/**
 * Core interface and logic of orchestration functionality.
 */
class Orchestrator {
    /**
    * @param {*} dependencies Things the orchestrator logic can't do without.
    * @param {*} options Options with defaults for orchestrator to use. Possible
    * properties are:
    * - packageManagerBaseUrl The base of the package manager server address for
    * devices to pull modules from.
    */
    constructor(dependencies, options) {
        this.database = dependencies.database;
        this.packageManagerBaseUrl = options.packageManagerBaseUrl || constants.PUBLIC_BASE_URI;
        if (!options.deviceMessagingFunction) {
            throw new utils.Error("method for communicating to devices not given");
        }
        this.messageDevice = options.deviceMessagingFunction;
    }

    async solve(deployment) {
        // Gather the devices and modules attached to deployment in "full"
        // (i.e., not just database IDs).
        let availableDevices = await this.database.read("device");
        // The original deployment should be saved to database as is with the
        // IDs TODO: Exactly why should it be saved?.
        let hydratedDeployment =  structuredClone(deployment);
        for (let step of hydratedDeployment.sequence) {
            step.device = availableDevices.find(x => x._id.toString() === step.device);
            step.module = (await this.database.read("module", { _id: step.module }))[0];
        }

        //TODO: Start searching for suitable packages using saved file.
        //startSearch();

        let updatedSequence = sequenceFromResources(hydratedDeployment.sequence, availableDevices);

        // Now that the deployment is deemed possible, an ID is needed to
        // construct the instructions on devices.
        let deploymentId = (await this.database.create("deployment", [deployment]))
            .insertedIds[0];

        let solution = createSolution(deploymentId, updatedSequence, this.packageManagerBaseUrl)

        // Update the deployment with the created solution.
        this.database.update(
            "deployment",
            { _id: deployment._id },
            solution
        );

        return deploymentId;
    }

    async deploy(deployment) {
        let deploymentSolution = deployment.fullManifest;

        let requests = [];
        for (let [deviceId, manifest] of Object.entries(deploymentSolution)) {
            let device = (await this.database
                .read("device", { _id: deviceId }))[0];

            if (!device) {
                throw new DeviceNotFound("", deviceId);
            }

            // Start the deployment requests on each device.
            requests.push([deviceId, this.messageDevice(device, "/deploy", manifest)]);
        }

        // Return devices mapped to their awaited deployment responses.
        return Object.fromEntries(await Promise.all(
            requests.map(async ([deviceId, request]) => {
                // Attach the device information to the response.
                let response = await request;
                return [deviceId, response];
            })
        ));
    }

    async schedule(deployment, params) {
        // Pick the starting point based on sequence's first device and function.
        let startEndpoint = deployment
            .fullManifest[deployment.sequence[0].device]
            .endpoints[deployment.sequence[0].func];

        // FIXME hardcoded: selecting first(s) from list(s).
        let url = new URL(startEndpoint.servers[0].url);
        // FIXME hardcoded: Selecting 0 because paths expected to contain only a
        // single item selected at creation of deployment manifest.
        let [pathName, pathObj] = Object.entries(startEndpoint.paths)[0];

        // Prepare given data for sending to device.
        // Build the SELECTED METHOD'S parameters for the request according to the
        // description.
        let method = Object.keys(pathObj).includes("get") ? "get" : "post";
        for (let param of pathObj[method].parameters) {
            if (!(param.name in params)) {
                response.status(400).json({ err:`Missing argument '${param.name}'` });
                return;
            }

            let argument = params[param.name];
            switch (param.in) {
                case "path":
                    // NOTE/FIXME: This might have already been resolved in
                    // deployment phase for each device to self-configure strictly
                    // (e.g., no generic paths "/mod/func" but concrete (and bit
                    // safer(?)) "/fibomod/fibofunc") according to orchestrator's
                    // solution.
                    pathName = pathName.replace(param.name, argument);
                    break;
                case "query":
                    // FIXME: What about URL-encoding?
                    url.searchParams.append(param.name, argument);
                    break;
                default:
                    response.status(500).json({ err:`This parameter location not supported: '${param.in}'` });
                    return;
            }
        }

        // NOTE: The URL should not contain any path before this point.
        url.pathname = pathName;

        let options = { method: method };
        // Request with GET/HEAD method cannot have body.
        if (!(["GET", "HEAD"].includes(method.toUpperCase()))) {
            // Body is set as is; the request is propagated. FIXME: duplication of
            // input data?
            options.body = params;
        }

        // Message the first device and return its reaction response.
        let response = await fetch(url, options);

        if (!response.ok) {
            throw new utils.Error(`request to ${url} failed`);
        }

        switch (response.headers.get("content-type")) {
            case "application/json":
                // FIXME: Assuming the return is LE-bytes list for 32 bit
                // integer.
                let intBytes = await response.json();
                let classIndex =
                    (intBytes[3] << 24) |
                    (intBytes[2] << 16) |
                    (intBytes[1] <<  8) |
                    (intBytes[0]);

                return {
                    message: `Responded with ${classIndex}`,
                    value: classIndex
                };
            case "image/jpeg":
                const CHAIN_RESULT_IMAGE_PATH = "./files/chainResultImg.jpeg";
                // Write image to a file to see results.
                const fs = require("fs");
                fs.writeFileSync(
                    CHAIN_RESULT_IMAGE_PATH,
                    Buffer.from(await res.arrayBuffer()),
                );

                return {
                    message: `Saved JPEG to ${CHAIN_RESULT_IMAGE_PATH}`
                };
            default:
                throw new utils.Error("Unsupported content type"+res.headers["Content-type"]);
        }
    }
}

/**
 * Solve for M2M-call interfaces and create individual instructions
 * (deployments) to send to devices.
 * to the deployment manifest.
 * @param {*} deploymentId The deployment ID is used to identify received POSTs
 * on devices regarding this deployment.
 * @returns The created solution.
 * @throws An error if building the solution fails.
 */
function createSolution(deploymentId, updatedSequence, packageBaseUrl) {
    let deploymentsToDevices = {};
    for (let x of updatedSequence) {
        let deviceIdStr = x.device._id.toString();

        // __Prepare__ to make a mapping of devices and their instructions in order to
        // bulk-send the instructions to each device when deploying.
        if (!(deviceIdStr in deploymentsToDevices)) {
            deploymentsToDevices[deviceIdStr] = new DeploymentNode(deploymentId);
        }

        // Fill in the details about needed modules and endpoints on each device.
        let moduleDataForDevice = moduleData(x.module, packageBaseUrl);
        let [funcc, endpoint] = endpointDescription(deploymentId, x);
        deploymentsToDevices[deviceIdStr].modules.push(moduleDataForDevice);
        // TODO ... Merge together into a single OpenAPI doc for __all__
        // the modules' endpoints.
        deploymentsToDevices[deviceIdStr].endpoints[funcc] = endpoint;
    }

    // It does not make sense to have a device without any possible
    // interaction (and this would be a bug).
    let unnecessaryDevice = Object.entries(deploymentsToDevices)
        .find(([_, x]) => Object.entries(x.endpoints).length === 0);
    if (unnecessaryDevice) {
        return `no endpoints defined for device '${unnecessaryDevice[0]}'`;
    }

    // According to deployment manifest describing the composed
    // application-calls, create a structure to represent the expected behaviour
    // and flow of data between nodes.
    for (let i = 0; i < updatedSequence.length; i++) {
        const [device, modulee, func] = Object.values(updatedSequence[i]);

        let deviceIdStr = device._id.toString();

        let forwardFunc = updatedSequence[i + 1]?.func;
        let forwardDeviceIdStr = updatedSequence[i + 1]?.device._id.toString();
        let forwardDeployment = deploymentsToDevices[forwardDeviceIdStr];

        let forwardEndpoint;
        if (forwardFunc === undefined || forwardDeployment === undefined) {
            forwardEndpoint = null;
        } else {
            // The order of endpoints attached to deployment is still the same
            // as it is based on the execution sequence and endpoints are
            // guaranteed to contain at least one item.
            forwardEndpoint = forwardDeployment.endpoints[forwardFunc];
        }

        let instruction = {
            to: forwardEndpoint,
        };

        // Attach the created details of deployment to matching device.
        deploymentsToDevices[deviceIdStr].instructions.add(modulee._id, func, instruction);
    }

    let sequenceAsIds = Array.from(updatedSequence)
        .map(x => ({
            device: x.device._id,
            module: x.module._id,
            func: x.func
        }));

    return {
        fullManifest: deploymentsToDevices,
        sequence: sequenceAsIds
    };
}

/**
 * Based on deployment sequence, confirm the existence (funcs in modules) and
 * availability (devices) of needed resources and select most suitable ones if
 * so chosen.
 * @param {*} sequence List (TODO: Or a graph ?) of calls between devices and
 * functions in order.
 * @returns The same sequence but with intelligently selected combination of
 * resources [[device, module, func]...] as Objects. TODO: Throw errors if fails
 * @throws String error if validation of given sequence fails.
 */
function sequenceFromResources(sequence, availableDevices) {
    let selectedModules = [];
    let selectedDevices = [];

    // Iterate all the items in the request's sequence and fill in the given
    // modules and devices or choose most suitable ones.
    for (let [device, modulee, funcName] of sequence.map(Object.values)) {
        // Selecting the module automatically is useless, as they can
        // only do what their exports allow. So a well formed request should
        // always contain the module-id as well.
        // Still, do a validity-check that the requested module indeed
        // contains the func.
        if (modulee.exports.find(x => x.name === funcName) !== undefined) {
            selectedModules.push(modulee);
        } else {
            throw `Failed to find function '${funcName}' from requested module: ${modulee}`;
        }

        function deviceSatisfiesModule(d, m) {
            return m.requirements.every(
                r => d.description.supervisorInterfaces.find(
                    interfacee => interfacee === r.name // i.kind === r.kind && i.module === r.module
                )
            );
        }

        if (device) {
            // Check that the device actually can run module and function.
            if (!deviceSatisfiesModule(device, modulee)) {
                throw `device '${device.name}' does not satisfy module's requirements`;
            }
        } else {
            // Search for a device that could run the module.
            device = availableDevices.find(d => deviceSatisfiesModule(d, modulee));

            if (!device) {
                throw `no matching device satisfying all requirements: ${JSON.stringify(modulee.requirements, null, 2)}`;
            }
        }
        selectedDevices.push(device);
    }

    // Check that length of all the different lists matches (i.e., for every
    // item in deployment sequence found exactly one module and device).
    let length =
        sequence.length === selectedModules.length &&
        selectedModules.length === selectedDevices.length
        ? sequence.length
        : 0;
    // Assert.
    if (length === 0) {
        throw `Error on deployment: mismatch length between deployment (${sequence.length}), modules (${selectedModules.length}) and devices (${selectedDevices.length}) or is zero`;
    }

    // Now that the devices that will be used have been selected, prepare to
    // update the deployment sequence's devices in database with the ones
    // selected (handles possibly 'null' devices).
    let updatedSequence = Array.from(sequence);
    for (let i = 0; i < updatedSequence.length; i++) {
        updatedSequence[i].device = selectedDevices[i];
        updatedSequence[i].module = selectedModules[i];
        updatedSequence[i].func   = sequence[i].func;
    }

    return updatedSequence;
}

/**
 * Extract needed module data that a device needs.
 * @param {*} modulee The module record in database to extract data from.
 * @param {*} packageBaseUrl The base of the package manager server address for
 * devices to pull modules from.
 * @returns Data needed and usable by a device.
 */
function moduleData(modulee, packageBaseUrl) {
    // Add data needed by the device for pulling and using a binary
    // (i.e., .wasm file) module.
    let binaryUrl;
    binaryUrl = new URL(packageBaseUrl);
    binaryUrl.pathname = `/file/module/${modulee._id}/wasm`;
    let descriptionUrl;
    descriptionUrl = new URL(packageBaseUrl);
    descriptionUrl.pathname = `/file/module/${modulee._id}/description`;

    // This is for any other files related to execution of module's
    // functions on device e.g., ML-models etc.
    let other = [];
    if (modulee.pb) {
        other.push((new URL(packageBaseUrl+`file/module/${modulee._id}/pb`)).toString());
    }
    return {
        id: modulee._id,
        name: modulee.name,
        urls: {
            binary: binaryUrl.toString(),
            description: descriptionUrl.toString(),
            other: other,
        },
    };
}

/**
 * Based on description of a node and functions that it should execute, put
 * together and fill out information needed for describing the service(s).
 * TODO Somehow filter out the unnecessary paths for this deployment that could
 * be attached to the module.
 * @param {*} deploymentId Identification for the deployment the endpoints will
 * be associated to.
 * @param {*} node OUT PARAMETER: The node containing data for where and how
 * execution of functions on it should be requested.
 * Should contain connectivity information (address and port) and definition of
 * module containing functions so they can be called with correct inputs.
 * @returns Pair of the function (index 0) and a pre-filled OpenAPI-doc endpoint
 * (index 1) specially made for this node for configuring (ideally most
 * effortlessly) the endpoint that function is available to be called from.
 */
function endpointDescription(deploymentId, node) {
    // Prepare options for making needed HTTP-request to this path.
    // TODO: Check for device availability here?
    // FIXME hardcoded: selecting first address.
    let urlString = node.module.openapi.servers[0].url;
    // FIXME hardcoded: "url" field assumed to be template "http://{serverIp}:{port}".
    urlString = urlString
        .replace("{serverIp}", node.device.communication.addresses[0])
        .replace("{port}", node.device.communication.port);
    let url = new URL(urlString);

    // FIXME hardcoded: "paths" field assumed to contain template "/{deployment}/modules/{module}/<thisFuncName>".
    // FIXME: URL-encode the names.
    const funcPathKey = Object.keys(node.module.openapi.paths)[0];//`/{deployment}/modules/{module}/${node.func}`;
    // TODO: Iterate all the paths.
    let funcPath = node.module.openapi.paths[funcPathKey];
    let filledFuncPathKey = funcPathKey
        .replace("{deployment}", deploymentId)
        .replace("{module}", node.module.name);

    // Fill out the prepared parts of the templated OpenAPI-doc.
    let preFilledOpenapiDoc = node.module.openapi;
    // Where the device is located.
    // FIXME hardcoded: selecting first address.
    preFilledOpenapiDoc.servers[0].url = url.toString();
    // Where and how to call the func.
    preFilledOpenapiDoc.paths[filledFuncPathKey] = funcPath;

    // Remove unnecessary fields.
    delete preFilledOpenapiDoc.paths[filledFuncPathKey].parameters
    // FIXME hardcoded: selecting first address.
    delete preFilledOpenapiDoc.servers[0].variables;
    // TODO: See above about filtering out unnecessary paths (= based on funcs).
    for (let unnecessaryPath of Object.keys(preFilledOpenapiDoc.paths).filter(x => x.includes("{module}"))) {
        delete preFilledOpenapiDoc.paths[unnecessaryPath];
    }

    return [node.func, preFilledOpenapiDoc];
}


module.exports = Orchestrator;