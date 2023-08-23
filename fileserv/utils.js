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
        this.error = error || "error";
    }
}

/**
* Middleware to confirm existence of an incoming file from a user-submitted
* form (which apparently `multer` does not do itself...).
*/
function validateFileFormSubmission(request, response, next) {
    if (request.method !== "POST") { next(); return; }

    // Check that request contains a file upload.
    if (!request.hasOwnProperty("file")) {
        response.status(400).send("file-submission missing");
        console.log("Bad request; needs a file-input for the module field");
        return;
    }
    next();
}

/**
 * Set where a file uploaded from a HTML-form will be saved to on the
 * filesystem.
 *
 * From: https://www.twilio.com/blog/handle-file-uploads-node-express
 * @param {*} destinationFilePath
 * @param {*} formFieldName
 * @returns Middleware for saving an incoming file.
 */
const fileUpload = (destinationFilePath, formFieldName) => require("multer")({ dest: destinationFilePath }).single(formFieldName);

/**
 * Return the main OpenAPI 3.1.0 operation of a deployment manifest starting
 * endpoint. This defines how a deployment's execution is started.
 *
 * @param {*} deployment Object with deployment fields
 * @returns { url, path, method, operationObj }
 */
function getStartEndpoint(deployment) {
    let startEndpoint = deployment
        .fullManifest[deployment.sequence[0].device]
        .endpoints[deployment.sequence[0].func];

    // FIXME hardcoded: selecting first(s) from list(s).
    let url = new URL(startEndpoint.servers[0].url);
    // FIXME hardcoded: Selecting 0 because paths expected to contain only a
    // single item selected at creation of deployment manifest.
    let [pathName, pathObj] = Object.entries(startEndpoint.paths)[0];

    // Build the __SINGLE "MAIN" OPERATION'S__ parameters for the request
    // according to the description.
    const OPEN_API_3_1_0_OPERATIONS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];
    let operations = Object.entries(pathObj)
        .filter(([method, _]) => OPEN_API_3_1_0_OPERATIONS.includes(method.toLowerCase()));
    console.assert(operations.length === 1, "expected one and only one operation");

    let [method, operationObj] = operations[0];

    return { url, path: pathName, method, operationObj };
}


module.exports = {
    respondWithFile,
    messageDevice,
    Error: ApiError,
    validateFileFormSubmission,
    fileUpload,
    getStartEndpoint,
};