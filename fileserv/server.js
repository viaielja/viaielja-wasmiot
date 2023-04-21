/**
 * Initialize server, database, mDNS and routes as needed. TODO How to access database in the routes?
 */

const path = require('path');
const { chdir } = require('process');

const { MongoClient } = require("mongodb");
const express = require("express");

const discovery = require("./src/deviceDiscovery");
const { MONGO_URI, PUBLIC_PORT, DEVICE_TYPE, FRONT_END_DIR } = require("./constants.js");


const expressApp = express();

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
 * Thing to use for searching and listing services found (by mDNS).
 */
let deviceDiscovery;

/**
 * For initializations and closing the database connection on shutdown.
 */
let databaseClient;

// Set working directory to this file's root in order to use relative paths
// (i.e. "./foo/bar"). TODO Find out if the problem is with incompatible Node
// versions (16 vs 18).
chdir(__dirname);

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

    initAndRunDeviceDiscovery();

    express.static.mime.define({"application/wasm": ["wasm"]});
    server = expressApp.listen(PUBLIC_PORT, async () => {
        console.log(`Listening on port: ${PUBLIC_PORT}`);
    });
})()
    .then(_ => { console.log("Finished!"); })
    .catch(e => {
        console.log("Orchestrator failed to start: ", e);
        shutDown();
    });

module.exports = {
    // From:
    // https://stackoverflow.com/questions/24621940/how-to-properly-reuse-connection-to-mongodb-across-nodejs-application-and-module
    getDb: function() { return db; },
    /**
     * Reset device discovery so that devices already discovered and running
     * will be discovered again. TODO: Is this a problem more with the server or
     * the mDNS library?
     * 
     * NOTE: Throws if re-initializing fails.
     */
    resetDeviceDiscovery: function() {
        deviceDiscovery.destroy();
        initAndRunDeviceDiscovery();
    }
};

// NOTE: This needs to be placed after calling main in order to initialize
// database before routes get access to it...
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
    databaseClient = new MongoClient(MONGO_URI);
    console.log(`Connecting to database through '${MONGO_URI}' ...`);
    try {
        const orchDb = (await databaseClient.connect()).db();
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
 * Create a new device discovery instance and run it.
 * 
 * NOTE: Throws if fails.
 */
function initAndRunDeviceDiscovery() {
    try {
        deviceDiscovery = new discovery.DeviceDiscovery(type=DEVICE_TYPE, db.device);
    } catch(e) {
        console.log("Device discovery initialization failed: ", e);
        throw e;
    }
    deviceDiscovery.run();
}


/**
 * Destroy the device discovery instance. This is basically just to log it
 * whenever its done without having it originate from the instance itself.
 */
function destroyDeviceDiscovery() {
    deviceDiscovery.destroy();
    console.log("Destroyed the mDNS instance.");

}
//////////
// ROUTES AND MIDDLEWARE (Note: call-order matters!):

/**
 * Middleware to log request methods.
 */
const requestMethodLogger = (request, response, next) => {
    console.log(`received ${request.method}: ${request.originalUrl}`);
    next();
}

/**
 * Middleware to log POST-requests.
 */
const postLogger = (request, response, next) => {
    if (request.method == "POST") {
        // If client is sending a POST request, log sent data.
        console.log(`body: ${JSON.stringify(request.body, null, 2)}`);
    }
    next();
}

// TODO: Gracefully handle malformed JSON POSTs (atm echoes the full error to
// _client_ because of NODE_ENV=development mode?)
const jsonMw = express.json();
const urlencodedExtendedMw = express.urlencoded({ extended: true });

// Order the middleware so that for example POST-body is parsed before trying to
// log it.
// TODO: Do __SCHEMA__ validation for POSTs (checking for correct fields and
// types etc.).
// TODO: Can the more fine-grained authentication (i.e. on DELETEs and POSTs but
// not on GETs) be done here?

expressApp.use(requestMethodLogger);

expressApp.use(
    "/file/device",
    [jsonMw, urlencodedExtendedMw, postLogger, routes.device]
);

expressApp.use(
    "/file/module",
    [jsonMw, routes.modules, postLogger] // TODO This post-placement of POST-logger is dumb...EDIT: Nice comment, very clear, you dumbass.
);

expressApp.use(
    "/file/manifest",
    [jsonMw, urlencodedExtendedMw, postLogger, routes.deployment]
);

expressApp.use(
    "/execute",
    [jsonMw, postLogger, routes.execution]
);

/**
 * Direct to a user-friendlier index-page.
 */
expressApp.get("/", (_, response) => {
    response.sendFile(path.join(FRONT_END_DIR, "index.html"));
});

/**
 * Direct to error-page when bad URL used.
 */
expressApp.all("/*", (_, response) => {
    response.status(404).send({ err: "Bad URL" });
});

////////////
// SHUTDOWN:

process.on("SIGTERM", shutDown);
// Handle CTRL-C gracefully; from
// https://stackoverflow.com/questions/43003870/how-do-i-shut-down-my-express-server-gracefully-when-its-process-is-killed
process.on("SIGINT", shutDown);

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

    await databaseClient.close();
    console.log("Closed database connection.");

    destroyDeviceDiscovery();

    console.log("Orchestrator shutdown finished.");
    process.exit();
}
