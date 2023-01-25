const fileSystem = require('fs'),
    path = require('path'),
    http = require('http');
const { chdir } = require('process');

const bonjour = require('bonjour')();
const express = require("express")();
const { MongoClient } = require("mongodb");


const utils = require("./utils");
const { FILE_ROOT, MODULE_DIR, MANIFEST_DIR, IOT_HOST_DOMAIN } = require("./utils");


// Set working directory to this file's root in order to use relative paths
// (i.e. "./foo/bar"). TODO Find out if the problem is with incompatible Node
// versions (16 vs 18).
chdir(__dirname);

/**
 * Describes the folder structure for initializing it on server startup
 * TODO Database plz.
 */
const fileDir = {
    "name": FILE_ROOT,
    "children": [
        {
            "name": MODULE_DIR,
            "children": []
        },
        {
            "name": MANIFEST_DIR,
            "children": []
        }
    ]
};


/**
 * Middleware to log all requests as needed.
 */
const requestLogger = (request, response, next) => {
    console.log(`received ${request.method}: ${request.originalUrl}`);
    if (request.method == "POST") {
        // If client is sending a POST request, log sent data.
        console.log(`body: ${JSON.stringify(request.body)}`);
    }
    next();
}

// TODO Use actual database (or atleast a JSON-file).
var db = {
    "deployment": {
        "86": { "path": "manifest.json" }
    },
    "device": {

    }
};

// MIDDLEWARES (Note: call-order matters!):
// Enable JSON-body parsing (NOTE: content-type by default has to be application/json).
express.use(require("express").json());
express.use(requestLogger);


/**
 * GET a Wasm-module; used by IoT-devices.
 */
express.get("/file/module/:wasmModule", (request, response) => {
    utils.respondWithFile(response, request.params.wasmModule, MODULE_DIR, ".wasm");
});


/**
 * GET list of packages or the "deployment manifest"; used by IoT-devices.
 */
express.get("/file/manifest/:deploymentId", (request, response) => {
    let id = request.params.deploymentId;

    let manifestPath = null;
    if (db.deployment.hasOwnProperty(id)) {
        manifestPath = db.deployment[id].path;
        utils.respondWithFile(response, manifestPath, MANIFEST_DIR, ".json");
    } else {
        response.status(400).send(`Not a valid deployment-id: '${id}'`);
    }
});


/**
 * POST a new device's architecture information (i.e., device description) to
 * add to orchestrator's database.
 */
express.post("/file/device", (request, response) => {
    let data = request.body;
    console.log(' --- this is a device description --- ');
    fileSystem.writeFile('./files/devicedescription.json', JSON.stringify(data), function (err) {
        if (err) return console.log(err);
        console.log('--- data written to file devicedescription.json ---');
    });
});


/**
 * POST a new deployment(TODO is that correct?) manifest to add to
 * orchestrator's database.
 */
express.post("/file/manifest", (request, response) => {
    let data = request.body;
    let deploymentId = generateDeploymentId();

    let filePath = path.join(FILE_ROOT, MANIFEST_DIR, `manifest-${deploymentId}`);

    let status = 200;
    let message = `Manifest ${deploymentId} added`;

    if (fileSystem.existsSync(filePath)) {
        console.log(`Tried to write existing manifest: ${filePath}`);
        status = 400;
        message = `Manifest already exists for deployment #${deploymentId}`;
    } else {
        // TODO Changed from async to sync (because client probably needs to know
        // if the request failed in order to send again) but was there some
        // reason not to?
        fileSystem.writeFileSync(filePath, JSON.stringify(data), function (err) {
            if (err) {
                console.log(`Failed adding the manifest: ${err}`);
                status = 500;
                message = "Failed adding the manifest";
            } else {
                //save sent json content of manifest to a json file
                console.log(`Manifest written to file '${filePath}'`);

                // Add its metadata to the database.
                addToDatabase("deployment", deploymentId, filePath);
                console.log(`Manifest added to database '${deploymentId}'`);

                startSearch(); //TODO: Start searching for suitable packages using saved file.
            }
        });
    }

    response.status(status).send(message).end(); // TODO Is calling 'end' really necessary?
});

/**
 * Direct to some "index-page" when bad URL used.
 */
express.all("/*", (_, response) => {
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

//////////////////////////////////////////////////
// Server initialization:

// Handle CTRL-C gracefully; from https://stackoverflow.com/questions/43003870/how-do-i-shut-down-my-express-server-gracefully-when-its-process-is-killed
// FIXME Does not seem to work with atleast "SIGTERM".
process.on("SIGTERM", () => {
    server.close((err) => {
        // Shutdown the mdns
        if (err) {
            console.log(`Errors from earlier 'close' event: ${err}`);
        }
        console.log("Closing server...");
    });

    // This seems to be synchronous because no callback provided(?)
    clearInterval(mdnsQueryPump);
    bonjour.destroy();
    console.log("Destroyed the mDNS instance.");

    console.log("Done!");
});

const PORT = 3000;

/**
 * The underlying nodejs http-server that app.listen() returns.
 */
let server;

async function main() {
    server = express.listen(PORT, () => {
        // TODO Confirm/create the needed directory structure.
        initializeDatabase();
        initializeMdns();
        console.log(`Listening on port: ${PORT}`);
    });
}

/**
 * Way to operate on the database.
 */
let databaseClient;

/**
 * Adapted from:
 * https://www.mongodb.com/developer/languages/javascript/node-connect-mongodb/
 */
async function initializeDatabase() {
    const uri = `mongodb://${process.env.CONFIG_MONGODB_ADMINUSERNAME}:${process.env.CONFIG_MONGODB_ADMINPASSWORD}@mongo:27017/`;
    databaseClient = new MongoClient(uri);
    try {
        await databaseClient.connect();
        // Print something from the db as example of connection.
        console.log("CONNECTED TO DATABASE: "+ JSON.stringify(await databaseClient.db().admin().listDatabases(), null, 2));
    } catch (e) {
        console.error("FAILED CONNECTING TO DATABASE >>>");
        console.error(e);
        console.error("<<<");
    } finally {
        await databaseClient.close();
    }
}

/**
 * ID of the interval that sends mDNS queries. Needed when shutting server down.
 */
let mdnsQueryPump;

/**
 * Start querying for IoT-devices and add their descriptions to database as
 * needed.
 */
function initializeMdns() {
    // Browse for all http services TODO browse for http services under the
    // wasmiot-domain instead?
    let browser = bonjour.find({ type: 'http' }, function (service) {
        console.log(`Found an HTTP server: ${service.name}! Querying it's description...`);
        http.get({ host: service.host, port: 3001, path: "/description" }, (res) => {
            console.log(`Reached the device at ${service.host} via HTTP: ${res.statusCode}`);
            let rawData = '';
            res.on('data', (chunk) => { rawData += chunk; });
            res.on('end', () => {
                try {
                    let dataObj = JSON.parse(rawData);
                    addToDatabase("device", service.name, dataObj);
                    console.log(`Added new device description: ${JSON.stringify(dataObj)}`)
                } catch (e) {
                    console.error(e.message);
                }
            });
        });

    })

    const callback = () => {
        console.log("Sending mDNS query...");
        browser.update();
    };
    // Send service queries every 5 seconds.
    // TODO Is this really needed?
    mdnsQueryPump = setInterval(callback, 5000);

    console.log(`mDNS initialized; searching for hosts under ${IOT_HOST_DOMAIN}`);
    callback(); // This is to execute the callback immediately as well.
}

//////////////////////////////////////////////////
// Database-functions NOTE/TODO Use an actual database! These are just
// placeholders in order to reduce clutter inside the code.

function generateDeploymentId() {
    // Get the largest ID and continue from that (assuming they're all
    // numerical) TODO Use an actual database.
    let last = Object.keys(db["deployment"]).map(x => parseInt(x)).sort().at(-1);
    return last ? last + 1 : 0;
}

/**
 * Add the object to the desired table in database.
 * @param {*} table The table to add the object to.
 * @param {*} id The id of the object in the table.
 * @param {*} obj The JSON-object to add.
 */
function addToDatabase(table, id, obj) {
    db[table][id] = obj;
}

main().catch(console.error);