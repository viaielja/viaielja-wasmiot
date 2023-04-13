/**
 * Initialize server, database, mDNS and routes as needed. TODO How to access database in the routes?
 */

const path = require('path');
const { chdir } = require('process');

const { MongoClient } = require("mongodb");
const express = require("express");

const discovery = require("./src/deviceDiscovery");
const { tempFormValidate, DEVICE_TYPE } = require("./utils");


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

    deviceDiscovery = new discovery.DeviceDiscovery(type=DEVICE_TYPE, db.device);
    deviceDiscovery.run();

    express.static.mime.define({"application/wasm": ["wasm"]});
    server = expressApp.listen(PORT, async () => {
        console.log(`Listening on port: ${PORT}`);
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
    [jsonMw, urlencodedExtendedMw, postLogger, tempFormValidate, routes.device]
);

expressApp.use(
    "/file/module",
    [jsonMw, routes.modules, postLogger] // TODO This post-placement of POST-logger is dumb...
);

expressApp.use(
    "/file/manifest",
    [jsonMw, urlencodedExtendedMw, postLogger, routes.deployment]
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
    response.send("Bad URL").status(404);
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

    deviceDiscovery.destroy();
    console.log("Destroyed the mDNS instance.");

    await databaseClient.close();
    console.log("Closed database connection.");

    console.log("Orchestrator shutdown finished.");
    process.exit();
}
