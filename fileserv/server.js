const fileSystem = require('fs'),
    path = require('path'),
    http = require('http');
const { chdir } = require('process');

const bonjour = require('bonjour')();
const express = require("express")();
const { MongoClient, ObjectId } = require("mongodb");


const utils = require("./utils");
const { IOT_HOST_DOMAIN } = require("./utils");

// Set working directory to this file's root in order to use relative paths
// (i.e. "./foo/bar"). TODO Find out if the problem is with incompatible Node
// versions (16 vs 18).
chdir(__dirname);


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

/**
 * Way to operate on the collections in database.
 */
let db = {
    device: null,
    module: null,
    deployment: null,
};

// MIDDLEWARES (Note: call-order matters!):
// Enable JSON-body parsing (NOTE: content-type by default has to be application/json).
express.use(require("express").json());
express.use(requestLogger);


/**
 * GET a Wasm-module; used by IoT-devices.
 */
express.get("/file/module/:moduleId", async (request, response) => {
    let doc = await db.module.findOne({_id: ObjectId(request.params.moduleId)});
    if (doc) {
        // TODO Only respond with the binary, not JSON.
        response.json(doc);
    } else {
        let errmsg = `Failed querying for deployment id: ${request.params.moduleId}`;
        console.log(errmsg);
        response.status(400).send(errmsg);
    }
});

/**
 * GET list of all Wasm-modules; used by Actors in constructing a deployment.
 */
express.get("/file/module/", async (request, response) => {
    // TODO What should this ideally return? Only IDs and descriptions?
    response.json(await db.module.find().toArray());
});

/**
 * GET list of packages or the "deployment manifest"; used by IoT-devices.
 */
express.get("/file/manifest/:deploymentId", async (request, response) => {
    let doc = await db.deployment.findOne({_id: ObjectId(request.params.deploymentId)});
    if (doc) {
        response.json(doc);
    } else {
        let errmsg = `Failed querying for deployment id: ${request.params.deploymentId}`;
        console.log(errmsg);
        response.status(400).send(errmsg);
    }
});

/**
 * GET list of all deployments; used by Actors in inspecting their deployments.
 */
express.get("/file/manifest/", async (request, response) => {
    // TODO What should this ideally return? Only IDs and descriptions?
    response.json(await db.deployment.find().toArray());
});

/**
 * GET list of all available IoT-devices; used by Actors in constructing a
 * deployment.
 */
express.get("/file/device/", async (request, response) => {
    // TODO What should this ideally return? Only IDs and descriptions?
    response.json(await db.device.find().toArray());
});




/**
 * POST a new device's architecture information (i.e., device description) to
 * add to orchestrator's database.
 */
express.post("/file/device", async (request, response) => {
    // TODO Only add what is allowed (e.g. _id should not come from POST).
    let result = await db.device.insertOne(request.body)
    if (result.acknowledged) {
        let msg = "New device added";
        console.log(msg);
        response.send(msg);
    } else {
        let msg = "failed to add the device";
        console.log(msg);
        response.status(500).send(msg);
    }
});


/**
 * POST a new deployment(TODO is that correct?) manifest to add to
 * orchestrator's database.
 */
express.post("/file/manifest", async (request, response) => {
    let data = request.body;
    let deploymentName = data.id;

    let status = 200;
    let message = `Manifest ${deploymentName} added`;

    // TODO When would a new deployment not be accepted? Based on user credits??
    let doc = await db.deployment.findOne({ name: deploymentName });
    if (doc) {
        console.log(`Tried to write existing manifest: ${JSON.stringify(doc)}`);
        status = 400;
        message = `Manifest already exists for deployment ${deploymentName}`;
    } else {
        // Add the new deployment to database.
        // TODO Only add what is allowed (e.g. _id should not come from POST).
        // TODO Add the whole body not just name.
        let result = await db.deployment.insertOne({ name: deploymentName });
        if (!result.acknowledged) {
            console.log(`Failed adding the manifest: ${err}`);
            status = 500;
            message = "Failed adding the manifest";
        } else {
            console.log(`Manifest added to database '${deploymentName}'`);

            //TODO: Start searching for suitable packages using saved file.
            //startSearch();
        }
    }

    // TODO Is calling 'end' really necessary?
    response.status(status).send(message).end();
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
// Server handling stuff:

///////////
// STARTUP:

const PORT = 3000;

/**
 * The underlying nodejs http-server that app.listen() returns.
 */
let server;

async function main() {
    server = express.listen(PORT, () => {
        // TODO Sometimes database is not ready for server operations. Consult
        // the docker-compose tutorial?
        initializeDatabase();
        initializeMdns();
        console.log(`Listening on port: ${PORT}`);
    });
}

/**
 * For initializations and closing the database connection on shutdown.
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
        const orchDb = await (await databaseClient.connect()).db();
        // Create references to the needed collections.
        db.module     = orchDb.collection("module");
        db.device     = orchDb.collection("device");
        db.deployment = orchDb.collection("deployment");

        // Print something from the db as example of connection.
        console.log("Connected to and initialized database: "+ JSON.stringify(await orchDb.admin().listDatabases(), null, 2));
    } catch (e) {
        console.error("FAILED CONNECTING TO DATABASE >>>");
        console.error(e);
        console.error("<<<");
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
        http.get({ host: service.host, port: service.port, path: "/description" }, (res) => {
            console.log(`Reached the device at ${service.host} via HTTP: ${res.statusCode}`);
            let rawData = '';
            res.on('data', (chunk) => { rawData += chunk; });
            res.on('end', () => {
                try {
                    let dataObj = JSON.parse(rawData);
                    db.device.insertOne({ name: service.name, placeholderfield: dataObj });
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

////////////
// SHUTDOWN:

// Handle CTRL-C gracefully; from https://stackoverflow.com/questions/43003870/how-do-i-shut-down-my-express-server-gracefully-when-its-process-is-killed
// TODO CTRL-C is apparently handled with SIGINT instead.

process.on("SIGTERM", async () => {
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

    await databaseClient.close();
    console.log("Closed database connection.");

    console.log("Done!");
});

///////////
// RUN MAIN
main().catch(console.error);