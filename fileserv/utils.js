const path = require('path');

module.exports = {
    respondWithFile,
    callDeviceFuncSingleIntegerArgument,
    callDeviceFuncRaw,
    callDeviceFuncHttp,
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
 * @param {*} deployment 
 * @param {*} device 
 * @param {*} funcData 
 * @param {*} inputInt 
 * @param {*} onResponse 
 * @param {*} onError 
 */
function callDeviceFuncSingleIntegerArgument(
    deployment,
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
 * @param {*} deployment Object containing information about the deployment.
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
    deployment,
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
    callDeviceFuncHttp(device, path, headers, input, onResponse, onError);
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

    // Set the input to send based on its type.
    if (typeof(input) === "string") {
        url.search = input;
    } else if (typeof(input) === "object") {
        if (input instanceof Uint8Array) {
            requestOptions.body = input;
        } else {
            throw `Tried sending device unsupported input instanceof: ${JSON.stringify(input, null, 2)}`;
        }
    } else {
        throw `Tried sending device unsupported input type '${typeof(input)}'`;
    }

    console.log(`Using HTTP '${method}' to call a func on '${url}' with headers: `, headers);

    fetch(url, requestOptions)
        .then(response => response.json().catch(onError))
        .then(onResponse)
        .catch(onError);
}
