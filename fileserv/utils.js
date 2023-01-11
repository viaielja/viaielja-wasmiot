var fileSystem = require('fs');

module.exports = {
    respondWithFile,
}

/// Perform boilerplate tasks when responding with a file read from filesystem.
function respondWithFile(response, filePath, contentType) {
    response.status(200)
        .type(contentType)
        .sendFile(filePath, err => {
            if (err) {
                response.sendStatus(404);
                console.log(`Tried to access nonexistent path: '${filePath}'`);
            } else {
                console.log(`Send file: '${filePath}'`);
            }
        });
}