const path = require('path');
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
