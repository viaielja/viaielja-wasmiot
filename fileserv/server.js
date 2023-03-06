/**
 * Initialize server, database, mDNS and routes as needed. TODO How to access database in the routes?
 */

const fileSystem = require('fs'),
    path = require('path'),
    http = require('http');
const { chdir } = require('process');

const { MongoClient } = require("mongodb");

const bonjour = require('bonjour')();
const express = require("express")();

const { DEVICE_TYPE, DEVICE_DESC_ROUTE } = require("./utils");

/**
 * Way to operate on the collections in database.
 */
let db = {
    device: null,
    module: null,
    deployment: null,
};

/**
 * The underlying nodejs http-server that app.listen() returns.
 */
let server;

/**
 * Browser to use for example for listing or unpublishing services found by mDNS.
 */
let bonjourBrowser;

/**
 * For initializations and closing the database connection on shutdown.
 */
let databaseClient;

// Set working directory to this file's root in order to use relative paths
// (i.e. "./foo/bar"). TODO Find out if the problem is with incompatible Node
// versions (16 vs 18).
chdir(__dirname);

const FRONT_END_DIR = path.join(__dirname, "frontend");

const PORT = 3000;

///////////
// RUN MAIN
(async function main() {
    console.log("Orchestrator starting...")

    // Must wait for database before starting to listen for web-clients.
    await initializeDatabase();
    console.log(db);
    // FIXME: The following print (i.e., calling stringify) would crash with
    // 'TypeError: Converting circular structure to JSON'.
    //console.log(`Database: ${JSON.stringify(db, null, 2)}`);

    bonjourBrowser = initializeMdns();

    server = express.listen(PORT, async () => {
        console.log(`Listening on port: ${PORT}`);
    });
})()
    .then(_ => { console.log("Finished!"); })
    .catch(e => {
        console.log("Orchestrator failed to start: " + e);
        shutDown();
    });

module.exports = {
    // From:
    // https://stackoverflow.com/questions/24621940/how-to-properly-reuse-connection-to-mongodb-across-nodejs-application-and-module
    getDb: function() { return db; },
};

// NOTE: This needs to be here in order to initialize database before routes get
// access to it...
const routes = require("./routes");



/**
 * Adapted from:
 * https://www.mongodb.com/developer/languages/javascript/node-connect-mongodb/
 */
async function initializeDatabase() {
    // NOTE: The hostname here (before ":<port>") MUST MATCH THE HOSTNAME ON THE
    // NETWORK for example with Docker Compose (i.e., do not name the
    // mongo-service differently in the .yml -files. Or otherwise TODO pass the
    // hostname from environment)
    const uri = `mongodb://${process.env.CONFIG_MONGODB_ADMINUSERNAME}:${process.env.CONFIG_MONGODB_ADMINPASSWORD}@mongo:27017/`;
    databaseClient = new MongoClient(uri);
    try {
        const orchDb = await (await databaseClient.connect()).db();
        // Create references to the needed collections.
        db.module = orchDb.collection("module");
        db.device = orchDb.collection("device");
        db.deployment = orchDb.collection("deployment");

        // Print something from the db as example of connection.
        console.log("Connected to and initialized database: " + JSON.stringify(await orchDb.admin().listDatabases(), null, 2));
    } catch (e) {
        console.error("FAILED CONNECTING TO DATABASE >>>");
        console.error(e);
        console.error("<<<");
        // Propagate the exception to caller.
        throw e;
    }
}

/**
 * Query device __for 'data'-events__ and if fails, remove from mDNS-cache.
 * NOTE: This is for device introduction and not for general queries!
 * @param {*} options Options to use in the GET request including the URL.
 * @param {*} callback What to do with the data when request ends.
 */
function queryDeviceData(options, callback) {
    http.get(options, (res) => {
        if (res.statusCode !== 200) {
            // Find and forget the service in question that's advertised host
            // failed to answer to HTTP-GET.
            console.log(`Service at '${options.host}${options.path}' failed to respond: Status ${res.statusCode}`);

            let service = bonjourBrowser.services.find(x => x.host == `${options.host}.local`);
            if (service) {
                // FIXME/TODO Bonjour keeps the device saved, but it should forget it
                // here because the device is not functional.
                console.log("UNIMPLEMENTED/TODO: Should forget the faulty device " + service.host);
            } else {
                console.log(`Did not find ${options.host} in currently known mDNS devices`);
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
    let device_doc = await db.device.findOne({ name: service.name });

    // Check if all the required information has been received earlier.
    if (device_doc !== null
        && device_doc.hasOwnProperty("description") && device_doc.description !== null
        && device_doc.hasOwnProperty("platform") && device_doc.platform !== null
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

        // Save description in database. TODO Use some standard way to
        // interact with descriptions (validations, operation,
        // contentType, security etc)?.
        db.device.updateOne(
            { _id: newId },
            { $set: { description: deviceDescription } },
            // Create the field if missing.
            { upsert: true }
        );
        console.log(`Adding device description for '${service.name}'`);
    });
}

/**
 * Start querying for IoT-devices and add their descriptions to database as
 * needed. Also set event listeners for browser TODO and services?.
 * @return The resulting Bonjour browser.
 */
function initializeMdns() {
    async function onFound(service) {
        // TODO/FIXME: A device is no longer "found" on mDNS after this but the
        // description-query-chain might fail ending up with nothing but nulls
        // in the database...
        let serviceInfo = {
            "addresses": service.addresses,
            "name": service.name,
            "fqdn": service.fqdn,
            "host": service.host,
        };
        console.log(`Found '${service.name}'! ${JSON.stringify(serviceInfo, null, 2)}`);
        saveDeviceData(service);
    }

    function onDown(service) {
        // Remove service from database once it leaves/"says goodbye".
        db.device.deleteOne({ name: service.name });
    }

    // Browse for all http services TODO browse for http services under the
    // wasmiot-domain instead?
    let queryOptions = { type: DEVICE_TYPE };
    let browser = bonjour.find(queryOptions, onFound);

    browser.on("down", onDown);

    // Bonjour/mDNS sends the queries on its own; no need to send updates
    // manually.
    console.log(`mDNS initialized; searching for hosts with ${JSON.stringify(queryOptions)}`);

    return browser;
}


///////////////////////////////////////////
// MIDDLEWARES (Note: call-order matters!):

/**
 * Middleware to log all requests as needed.
 */
const requestLogger = (request, response, next) => {
    console.log(`received ${request.method}: ${request.originalUrl}`);
    if (request.method == "POST") {
        // If client is sending a POST request, log sent data.
        console.log(`body: ${JSON.stringify(request.body, null, 2)}`);
    }
    next();
}

// Enable JSON-body parsing (NOTE: content-type by default has to be application/json).
express.use(require("express").json());
express.use(require("express").urlencoded());
express.use(requestLogger);

//////////
// ROUTES:

express.use("/file/device", routes.device);
express.use("/file/module", routes.modules);
express.use("/file/manifest", routes.deployment);

/**
 * Direct to some "index-page" when bad URL used.
 */
express.all("/*", (_, response) => {
    response.sendFile(path.join(FRONT_END_DIR, "index.html"));
});

////////////
// SHUTDOWN:

// Handle CTRL-C gracefully; from https://stackoverflow.com/questions/43003870/how-do-i-shut-down-my-express-server-gracefully-when-its-process-is-killed
// TODO CTRL-C is apparently handled with SIGINT instead.

process.on("SIGTERM", async () => {
    shutDown();
});

/**
 * Shut the server and associated services down.
 * TODO: Might not be this easy to do...
 */
async function shutDown() {
    if (server) {
        server.close((err) => {
            // Shutdown the mdns
            if (err) {
                console.log(`Errors from earlier 'close' event: ${err}`);
            }
            console.log("Closing server...");
        });
    }

    bonjour.destroy();
    console.log("Destroyed the mDNS instance.");

    await databaseClient.close();
    console.log("Closed database connection.");

    console.log("Orchestrator shutdown finished.");
}
