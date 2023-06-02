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

    // 2. prepare given data for sending to device.
    // Build the SELECTED METHOD'S parameters for the request according to the
    // description.
    let method = Object.keys(pathObj).includes("get") ? "get" : "post";
    for (let param of pathObj[method].parameters) {
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
        async function(res) {
            // TODO: Handle based on the description's response type.
            // Assume the end of chain responds with JSON for now...
            if (!res.ok) {
                response.status(500).json(new Error(`request to ${url} failed`));
                return;
            }

            switch (res.headers.get("content-type")) {
                case "application/json":
                    // FIXME: Assuming the return is LE-bytes list for 32 bit
                    // integer.
                    let intBytes = await res.json();
                    let classIndex = 
                        (intBytes[3] << 24) | 
                        (intBytes[2] << 16) | 
                        (intBytes[1] <<  8) | 
                        (intBytes[0]);
                    response.json(new utils.Success(classIndex));
                    return;
                case "image/jpeg":
                    const CHAIN_RESULT_IMAGE_PATH = "./files/chainResultImg.jpeg";
                    // Write image to a file to see results.
                    const fs = require("fs");
                    fs.writeFileSync(
                        CHAIN_RESULT_IMAGE_PATH,
                        Buffer.from(await res.arrayBuffer()),
                    );
                    response.json(new utils.Success("Saved JPEG to "+CHAIN_RESULT_IMAGE_PATH));
                    return;
                default:
                    response.json(new Error("Unsupported content type"+res.headers["Content-type"]));
            }

            //let jsonResponse;
            //try {
            //    jsonResponse = await res.json();
            //} catch (err) {
            //    console.log(`Error while parsing JSON from response':`, err);
            //    response.status(500).json({ err: err });
            //    return;
            //}
            //console.log(`Execution: URL at '${url}' responded:`, jsonResponse);
            //response.json(jsonResponse);
            response.json({"foo": "bar"});
        },
        function(err) {
            console.log(`Error while posting to URL'${url}':`, err);
            // TODO: What is correct status code here (technically device
            // could have failed, not orchestrator)?
            response.status(500).json({ err: err });
        }
    );
});
