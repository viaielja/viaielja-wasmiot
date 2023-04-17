const http = require('http');
const path = require('path');


/////////////
// CONSTANTS:
const FILE_ROOT = path.join(__dirname, "files");
const MODULE_DIR = path.join(__dirname, "files", "wasm");
const MANIFEST_DIR = "manifest";
// TODO: Use dot after "local" or no?
const ORCHESTRATOR_NAME = "orchestrator-wasmiot.local.";
const DEVICE_DESC_ROUTE = "/.well-known/wasmiot-device-description";
const DEVICE_WOT_ROUTE = "/.well-known/wot-thing-description";
// NOTE: "webthing" is what the JS-library returns as type for Flask-host's
// "_webthing._tcp.local.", soooo search for those.
const DEVICE_TYPE = "webthing";


module.exports = {
    respondWithFile,
    tempFormValidate,
    callDeviceFunc,
    FILE_ROOT,
    MODULE_DIR,
    MANIFEST_DIR,
    ORCHESTRATOR_NAME,
    DEVICE_DESC_ROUTE,
    DEVICE_TYPE,
};


/// Perform boilerplate tasks when responding with a file read from filesystem.
function respondWithFile(response, filePath, contentType) {
    response.status(200)
        .type(contentType)
        .sendFile(filePath);
}

function reducer(dependency, version) {
    if (!dependency[version]) {
        dependency.push(version);
    }
    else return null;

}

/**
 * Set the request.body to json parsed from a single text-field in the
 * __actual__ request body.
 * NOTE: THIS IS A TEMPORARY UTILITY.
 * @returns Parsed JSON-data from the stupid form.
 */
function tempFormValidate(request, response, next) {
    if (request.method !== "POST") { next(); return; }

    let data = request.body["json"] ?? null;
    if (data === null) {
        response
            .status(400)
            .send("Field 'json' containing the deployment not found in request");
        return;
    } else {
        try {
            data = JSON.parse(data);
        } catch (error) {
            response
                .status(400)
                .send(error.message);
            return;
        }
    }
    request.body = data;
    next();
}

/**
 * Send a message to device to start executing a function related to a
 * deployment.
 * @param {*} deploymentId Identifier of the deployment.
 * @param {*} device Object with `address` and `port` where to send.
 * @param {*} funcData Object with the function's `name` and identifier of its `module` on the device.
 * @param {*} input `Buffer` or `Uint8Array` (see:
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Typed_arrays) of the input
 * to be sent and passed to the Wasm-function at receiver. NOTE: Raw bytes currently.
 * @param {*} onResponse Callback matching the nodejs v18 http.request call with
 * the single argument `response` TODO: Any need to generalize this for
 * non-http?. Called when received the response (if any) from device in order
 * to handle it.
 * @param {*} onError Callback matching the nodejs v18 http.request call's event
 * "error" with the single argument `error` TODO: Any need to generalize this
 * for non-http?
  */
function callDeviceFunc(
    deploymentId,
    device,
    funcData,
    input,
    onResponse,
    onError,
) {
    // TODO: Remove this. Should be handled by _caller_ as told in the docstring.
    let moduleIdentifierOnDevice = funcData.module.name;
    // TODO: Should the device use deploymentId or other identifier (blockchain?
    // /s) in order to connect (potentially multiple) deployed
    // instruction-sequences together?
    let requestOptions = {
        method: "POST",
        protocol: "http:",
        host: device.address,
        port: device.port,
        // TODO: REMOVE hardcode. Use description received from WoT for correct URL?
        path: `/modules/${moduleIdentifierOnDevice}/${funcData.name}`,
        headers: {
            "Content-type": "application/octet-stream",
            "Content-length": input.byteLength,
        }
    };

    let request = http.request(requestOptions, onResponse);
    request.on("error", onError);

    request.write(input);
    request.end();
}