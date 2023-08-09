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
 * Send a message to device with HTTP.
 * @param {*} device Device object describing communication (i.e. device address and port).
 * @param {*} path Path to send the message to.
 * @param {*} body Message content that will be serialized into JSON.
 * @param {*} method HTTP method to use.
 * @return {*} Promise of the HTTP response's status code and body parsed from JSON: `{ status, data }`.
 */
function messageDevice(device, path, body, method="POST") {
    let url = new URL(`http://${device.communication.addresses[0]}:${device.communication.port}/${path}`);
    let requestOptions = {
        method: method,
        headers: {
            "Content-type": "application/json",
            // TODO: This might not be needed: "Content-length": Buffer.byteLength(jsonStr),
        },
        body: JSON.stringify(body),
    };

    console.log(`Sending '${method}' request to device '${url}': `, body);

    return fetch(url, requestOptions)
        .then(response => response.json().then(data => ({ status: response.status, data })));
}

/**
 * Generic representation of an error response from the API.
 *
 * Fields:
 * - `errorText` Human friendly description of the error that client could
 * choose to display.
 * - `error` The concrete error object.
 */
class ApiError {
    constructor(errorText, error) {
        this.errorText = errorText;
        this.error = error;
    }
}

module.exports = {
    respondWithFile,
    messageDevice,
    Error: ApiError,
};