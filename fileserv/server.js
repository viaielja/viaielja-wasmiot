var express = require("express");
var fileSystem = require('fs'),
    path = require('path');

const { chdir } = require('process');

var utils = require("./utils");


// Set working directory to this file's root in order to use relative paths
// (i.e. "./foo/bar"). TODO Find out if the problem is with incompatible Node
// versions (16 vs 18).
chdir(__dirname);

/// Middleware to log all requests as needed.
const logger = (request, response, next) => {
    console.log(`received ${request.method}: ${request.originalUrl}`);
    if (request.method == "POST") {
        // If client is sending a POST request, log sent data.
        console.log(`body: ${JSON.stringify(request.body)}`);
    }
    next();
}

var app = express();

// TODO Use actual database (or atleast a JSON-file).
var db = {
    "deployment": {
        "86": { "path": "manifest.json" }
    },
};

// MIDDLEWARES (Note: call-order matters!):
// Enable JSON-body parsing (NOTE: content-type by default has to be application/json).
app.use(express.json());
app.use(logger);


/// GET a Wasm-module; used by IoT-devices.
app.get("/file/module/:wasmModule", (request, response) => {
    utils.respondWithFile(response, request.params.wasmModule, "files", ".wasm");
});


/// GET list of packages or the "deployment manifest"; used by IoT-devices.
app.get("/file/manifest/:deploymentId", (request, response) => {
    let id = request.params.deploymentId;

    let manifestPath = null;
    if (db.deployment.hasOwnProperty(id)) {
        manifestPath = db.deployment[id].path;
        utils.respondWithFile(response, manifestPath, "files", ".json");
    } else {
        response.status(400).send(`Not a valid deployment-id: '${id}'`);
    }
});


app.post("/", (request, response) => {
    let data = request.body;

    if (Object.keys(data).includes('architecture')) { // Handle Device Descriptions
        console.log(' --- this is a device description --- ');
        fileSystem.writeFile('./files/devicedescription.json', JSON.stringify(data), function (err) {
            if (err) return console.log(err);
            console.log('--- data written to file devicedescription.json ---');
        });
    }
    //save sent json content of manifest to a json file
    else fileSystem.writeFile('./files/manifest.json', JSON.stringify(data), function (err) { // Handle Manifest files
        if (err) return console.log(err);
        console.log('data written to file manifest.json');
        // TODO How to do this with expressjs?
        //response.end(startSearch()); //TODO: Start searching for suitable packages using saved file
    });

    response.send("API called :)");
});


/// Direct to some "index-page" when bad URL used.
app.all("/*", (_, response) => {
    response.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset='utf-8'>
  <title>Wasm-IoT</title>
</head>
<body>
  <p>Wasm-IoT - Orchestration server<br/>Please use an existing route.</p>
</body>
</html>`
    );
});


const port = 3000;
app.listen(port, () => {
    console.log(`Listening on port: ${port}`);
});