const { type } = require('os');
const path = require('path');
const url = require("url");


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
    callDeviceFuncSingleIntegerArgument,
    callDeviceFuncRaw,
    callDeviceFuncHttp,
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
 * Send a message to device to start executing a function related to a
 * deployment with input being a single integer.
 * @param {*} deploymentId 
 * @param {*} device 
 * @param {*} funcData 
 * @param {*} inputInt 
 * @param {*} onResponse 
 * @param {*} onError 
 */
function callDeviceFuncSingleIntegerArgument(
    deploymentId,
    device,
    funcData,
    inputInt,
    onResponse,
    onError,
) {
    let moduleIdentifierOnDevice = funcData.module.name;
    let path = `/modules/${moduleIdentifierOnDevice}/${funcData.name}`;
    let input = `param1=${inputInt}`;
    let headers = { };

    callDeviceFuncHttp(device, path, headers, input, onResponse, onError, method="GET");
}

/**
 * Send a message to device to start executing a function related to a
 * deployment with input being a "raw" byte-buffer.
 * @param {*} deploymentId Identifier of the deployment.
 * @param {*} device Object with `address` and `port` where to send.
 * @param {*} funcData Object with the Wasm-function's `name` and identifier of its `module` on the device.
 * @param {*} input `Buffer` or `Uint8Array` (see:
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Typed_arrays) of the input
 * to be sent and passed to the Wasm-function at receiver.
 * @param {*} onResponse Callback matching the nodejs v18 http.request call with
 * the single argument `response` TODO: Any need to generalize this for
 * non-http?. Called when received the response (if any) from device in order
 * to handle it.
 * @param {*} onError Callback matching the nodejs v18 http.request call's event
 * "error" with the single argument `error` TODO: Any need to generalize this
 * for non-http?
  */
function callDeviceFuncRaw(
    deploymentId,
    device,
    funcData,
    input,
    onResponse,
    onError,
) {
    // TODO: Remove this. Should be handled by _caller_ as told in the docstring.
    let moduleIdentifierOnDevice = funcData.module.name;

    // TODO: REMOVE these hardcode(s) (i.e., path and content-type). Use
    // received Thing Descriptions for correct values according to WoT?
    let path = `/modules/${moduleIdentifierOnDevice}/${funcData.name}`;
    let headers = {
        "Content-type": "application/octet-stream",
        "Content-length": input.byteLength,
    };
    callDeviceFuncHttp(device, path, headers, onResponse, onError, input);
}

/**
 * Helper for making HTTP request with input. Uses `fetch()`.
 * @param {*} device 
 * @param {*} path 
 * @param {*} headers 
 * @param {*} input "search"-string (as in
 * https://nodejs.org/api/url.html#urlsearch
 * or Byte input TODO Latter not implemented.
 * @param {*} onResponse JSON-result handler.
 * @param {*} onError Fetch rejection handler.
 * @param {*} method 
 */
function callDeviceFuncHttp(device, path, headers, input, onResponse, onError, method="POST") {
    // TODO: Should the device use deploymentId or other identifier (blockchain?
    // /s) in order to connect (potentially multiple) deployed
    // instruction-sequences together?

    let requestOptions = {
        method: method,
        headers: headers,
    };   
    let url = new URL(`http://${device.address}:${device.port}`);
    url.pathname = path;
    if (typeof(input) === "string") {
        url.search = input;
    }

    console.log(`Using HTTP '${method}' to call a func on '${url}' with headers: `, headers);

    fetch(url, requestOptions)
        .then(response => response.json())
        .then(onResponse)
        .catch(onError);
}
