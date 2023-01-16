var fileSystem = require('fs');

module.exports = {
    respondWithFile,
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

