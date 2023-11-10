// Hack to make this file work in both Node.js and browser without erroring.
let runningInBrowser = false;
let multer = undefined;
try {
    multer = require("multer");
} catch (e) {
    console.log("Importing with 'require' failed; assuming we're in a browser");
    runningInBrowser = true;
}


/**
 * Return the path that is used on supervisor for calling functions.
 * @param {*} moduleId
 * @param {*} funcName
 * @returns
 */
function supervisorExecutionPath(moduleName, funcName) {
    return `/{deployment}/modules/${moduleName}/${funcName}`;
}

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

    // Check that request contains files uploaded.
    if (!request.hasOwnProperty("files")) {
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
 * @returns Middleware for saving incoming files named in by strings in `fields`.
 */
const fileUpload =
    (destinationFilePath) =>
        //(fields) =>
            multer({ dest: destinationFilePath })
                .any();
                //TODO: This'd be a tad nicer/secure: .fields(fields.map(field => ({ name: field, maxCount: 1 })));

/**
 * Return the main OpenAPI 3.1.0 operation of a deployment manifest starting
 * endpoint. This defines how a deployment's execution is started.
 *
 * @param {*} deployment Object with deployment fields
 * @returns { url, path, method, operationObj }
 */
function getStartEndpoint(deployment) {
    let startStep = deployment.sequence[0];
    let modId = startStep.module;
    let modName = deployment
        .fullManifest[startStep.device]
        .modules
        .find(x => x.id.toString() === modId.toString()).name;
    let startEndpoint = deployment
        .fullManifest[startStep.device]
        .endpoints[modName][startStep.func];

    // Change the string url to an object.
    startEndpoint.url = new URL(startEndpoint.url);

    return startEndpoint;
}


if (!runningInBrowser) {
    module.exports = {
        supervisorExecutionPath,
        respondWithFile,
        messageDevice,
        Error: ApiError,
        validateFileFormSubmission,
        fileUpload,
        getStartEndpoint,
    };
}