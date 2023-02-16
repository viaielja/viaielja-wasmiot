const fileSystem = require('fs'),
    path = require('path'),
    http = require('http');
const { chdir } = require('process');

const bonjour = require('bonjour')();
const express = require("express")();
const { MongoClient, ObjectId } = require("mongodb");


const { DEVICE_DESC_ROUTE, DEVICE_TYPE } = require("./utils");

// Set working directory to this file's root in order to use relative paths
// (i.e. "./foo/bar"). TODO Find out if the problem is with incompatible Node
// versions (16 vs 18).
chdir(__dirname);

const FRONT_END_DIR = path.join(__dirname, "frontend");

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
    response.sendFile(path.join(FRONT_END_DIR, "index.html"));
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
    server = express.listen(PORT, async () => {
        // TODO Sometimes database is not ready for server operations. Consult
        // the docker-compose tutorial?
        await initializeDatabase();
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
 * Browser to use for example for listing or unpublishing services found by mDNS.
 */
let bonjourBrowser;

/**
 * Start querying for IoT-devices and add their descriptions to database as
 * needed.
 */
function initializeMdns() {
    // Browse for all http services TODO browse for http services under the
    // wasmiot-domain instead?
    let queryOptions = { type: DEVICE_TYPE };
    bonjourBrowser = bonjour.find(queryOptions, async function (service) {
        // TODO/FIXME: A device is no longer "found" on mDNS after this but the
        // description-query-chain might fail ending up with nothing but nulls
        // in the database...
        console.log(`Found '${service.name}'! ${JSON.stringify(service, null, 2)}`);
        saveDeviceData(service);
    });

    // Remove service from database once it leaves/"says goodbye".
    bonjourBrowser.on("down", (service) => {
        db.device.deleteOne({ name: service.name });
    });

    // Bonjour/mDNS sends the queries on its own; no need to send updates
    // manually.
    console.log(`mDNS initialized; searching for hosts with ${JSON.stringify(queryOptions)}`);
}

/**
 * Query device __for 'data'-events__ and if fails, remove from mDNS-cache.
 * @param {*} options Options to use in the GET request including the URL.
 * @param {*} callback What to do with the data when request ends.
 */
function queryDeviceData(options, callback) {
    http.get(options, (res) => {
        if (res.statusCode !== 200) {
            // Find and forget the service in question that's advertised host
            // failed to answer to HTTP-GET.
            console.log(`Service at '${options.host}${options.path}' failed to respond: Status ${res.statusCode}`);
            for (let service of bonjourBrowser.services) {
                if (service.host === options.host) {
                    service.stop(()=> {
                        console.log("Unpublished service: " + JSON.stringify(service));
                    });
                }
            }
            return null;
        } else {
            let rawData = '';
            res.on('data', (chunk) => { rawData += chunk; });
            res.on('end', () => callback(rawData));
        }
    });
}

/**
 * Query information like WoT-description and platform info to be saved into the
 * database from the device.
 * @param {*} service The service object discovered via mDNS.
 */
async function saveDeviceData(service) {
    // Check for duplicate service
    let device_doc = await db.device.findOne({name: service.name});
    if (device_doc !== null
        && device_doc.description !== null
        && device_doc.platform !== null
    ) {
        console.log(`The device named '${device_doc.name}' is already in the database!`);
        return;
    }
    
    // Insert or get new device into database for updating in GET-callbacks.
    let newId;
    if (device_doc === null) {
        try {
            let obj = {
                name: service.name,
            };
            let res = await db.device.insertOne(obj);
            newId = res.insertedId;
            console.log(`Added new device: ${JSON.stringify(obj, null, 2)}`)
        } catch (e) {
            console.error(e.message);
        }
    } else {
        newId = device_doc._id;
    }

    // FIXME This is due to flask-host self-defining its address into ending
    // with ".local.", and is not a great way to handle it.
    let host = service.host.endsWith(".local")
        ? service.host.substring(0, service.host.indexOf(".local")) 
        : service.host;

    let requestOptions = { host: host, port: service.port, path: DEVICE_DESC_ROUTE };

    console.log(`Querying service's description(s) via HTTP... ${JSON.stringify(requestOptions)}`);

    // The returned description should follow the common schema for WasmIoT TODO
    // Perform validation.
    queryDeviceData(requestOptions, (data) => {
        let deviceDescription = JSON.parse(data);

        // Save description in database.
        db.device.updateOne(
            { _id: newId },
            { $set: { description: deviceDescription } },
            // Create the field if missing.
            { upsert: true }
        );
        console.log(`Adding device description for '${service.name}'`);

        // Now get and save the platform info TODO Use some standard way to
        // interact with Thing Descriptions (validations, operation,
        // contentType, security etc)?.
        requestOptions.path = deviceDescription.properties.platform.forms[0].href;
        queryDeviceData(requestOptions, (data2) => {
            let platformInfo = JSON.parse(data2);
            db.device.updateOne(
                { _id: newId },
                { $set: { platform: platformInfo } },
                { upsert: true }
            );
            console.log(`Adding device platform info for '${service.name}'`);
        });
    });
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

    bonjour.destroy();
    console.log("Destroyed the mDNS instance.");

    await databaseClient.close();
    console.log("Closed database connection.");

    console.log("Done!");
});

///////////
// RUN MAIN
main().catch(console.error);