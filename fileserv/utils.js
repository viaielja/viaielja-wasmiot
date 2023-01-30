const path = require('path');


const FILE_ROOT = path.join(__dirname, "files");
const MODULE_DIR = "module";
const MANIFEST_DIR = "manifest";
// TODO: Use dot after "local" or no?
const ORCHESTRATOR_NAME = "orchestrator-wasmiot.local.";
const IOT_HOST_DOMAIN = "device-wasmiot.local.";

module.exports = {
    respondWithFile,
    FILE_ROOT,
    MODULE_DIR,
    MANIFEST_DIR,
    ORCHESTRATOR_NAME,
    IOT_HOST_DOMAIN,
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
