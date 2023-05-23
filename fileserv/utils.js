const path = require('path');


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
    // NOTE: the module name must be the same as deployed and saved on the
    // device.
    let path = `/modules/${funcData.module.name}/${funcData.name}`;
    let input = `param1=${inputInt}`;

    let url = new URL(`http://${device.addresses[0]}:${device.port}`);
    url.pathname = path;
    url.search = input;

    callDeviceFuncHttp(url, { method: "GET" }, onResponse, onError);
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

    callDeviceFuncHttp(
        `http://${device.addresses[0]}:${device.port}/${path}`,
        { headers: headers, body: input, method: "POST" },
        onResponse,
        onError
    );
}

/**
 * Tiny helper (FIXME not sure if this even helps in any significant way) for
 * making HTTP request to a supervisor's URL.
 * @param {*} url Url to call.
 * @param {*} options The same options as for `fetch()`.
 * @param {*} onResponse JSON-result handler.
 * @param {*} onError Fetch and JSON-parsing's rejection handler.
 */
async function callDeviceFuncHttp(url, options, onResponse, onError) {
    console.log(`Using HTTP '${options.method}' to call a func on '${url}' with headers:`, options.headers);

    try {
        let response = await fetch(url, options);
        let jsonResponse = await response.json();
        onResponse(jsonResponse);
    } catch (error) {
        onError(error);
    } 
}

/**
 * "Enum variant" for an error with result containing some data.
 */
class Error {
    constructor(data) {
        this.error = data;
    }
}

/**
 * "Enum variant" for a success with result containing some data.
 */
class Success {
    constructor(data) {
        this.success = data;
    }
}

module.exports = {
    respondWithFile,
    callDeviceFuncSingleIntegerArgument,
    callDeviceFuncRaw,
    callDeviceFuncHttp,
    Error,
    Success,
};