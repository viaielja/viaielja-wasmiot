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


/**
 * Perform boilerplate tasks when responding with a file read from filesystem.
 *
 * Terms for the different parts of a path as defined by NodeJS:
 * https://nodejs.org/dist/latest-v18.x/docs/api/path.html#pathparsepath
 * @param {*} response The response object.
 * @param {*} filePath Name of the file to send POSSIBLY INPUTTED/REQUESTED BY USER/CLIENT.
 * @param {*} directory Directory to search for the file.
 * @param {*} extension Required extension of the file to check.
 */
function respondWithFile(response, filePath, directory, extension) {
    // Normalize path into the base name.
    let file = path.parse(path.normalize(filePath));
    // Check for correct extension.
    if (file.ext !== extension) {
        response.status(400).send(`Bad extension on "${file.base}"; needs "${extension}"`)
    } else {
        let filePath = path.join(FILE_ROOT, directory, file.base);
        response.status(200)
            // The sendfile-method handles the Content-Type header based on
            // filename's extension.
            .sendFile(filePath, {}, err => {
                if (err) {
                    console.log(`Error serving file '${filePath}': ${err}`);
                    response.sendStatus(400);
                } else {
                    console.log(`Send file: '${filePath}'`);
                }
            });
    }
}