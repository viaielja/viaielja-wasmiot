const path = require('path');

module.exports = {
    respondWithFile,
}


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
        let filePath = path.join(__dirname, "files", directory, file.base);
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