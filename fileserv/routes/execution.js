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
    
    // Pick the starting point based on sequence's first device and function.
    let startEndpoint = deployment
        .fullManifest[deployment.sequence[0].device]
        .endpoints[deployment.sequence[0].func];

    // FIXME hardcoded: selecting first(s) from list(s).
    let url = new URL(startEndpoint.servers[0].url);
    // FIXME hardcoded: Selecting 0 because paths expected to contain only a
    // single item selected at creation of deployment manifest.
    let [pathName, pathObj] = Object.entries(startEndpoint.paths)[0];
    // TODO: Only one method should be available here but idk if OpenAPI doc
    // fits that idea...
    let method = "get" in pathObj ? "GET" : "POST";

    // 2. prepare given data for sending to device.
    // Build the SELECTED METHOD'S parameters for the request according to the
    // description.
    for (let param of pathObj[method.toLowerCase()].parameters) {
        if (!(param.name in request.body)) {
            response.status(400).json({ err:`Missing argument '${param.name}'` });
            return;
        }

        let argument = request.body[param.name];
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
        options.body = request.body;
    }

    // TODO: Include MIME type to request?

    // 3. post data to the first device and return its reaction response.
    // TODO: Could device sometimes want to answer back with the execution result?
    utils.callDeviceFuncHttp(
        url,
        options,
        function(jsonResponse) {
            console.log(`Execution: URL at '${url}' responded:`, jsonResponse);
            response.json(jsonResponse);
        },
        function(err) {
            console.log(`Error while posting to URL'${url}':`, err);
            // TODO: What is correct status code here (technically device
            // could have failed, not orchestrator)?
            response.status(500).json({ err: err });
        }
    );
});