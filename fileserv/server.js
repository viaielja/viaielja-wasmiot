/**
 * Initialize server, database, mDNS and routes as needed.
 */

const path = require('path');
const { chdir } = require('process');

const express = require("express");

const { MongoDatabase } = require("./src/database");
const discovery = require("./src/deviceDiscovery");
const { MONGO_URI, PUBLIC_PORT, PUBLIC_BASE_URI, DEVICE_TYPE, FRONT_END_DIR, SENTRY_DSN } = require("./constants.js");


const expressApp = express();

/**
 * The underlying nodejs http-server that app.listen() returns.
 */
let server;

/**
 * Thing to use for searching and listing services found (by mDNS).
 */
let deviceDiscovery;

/**
 * For operations on the database connection and its collections.
 */
let database;

// Set working directory to this file's root in order to use relative paths
// (i.e. "./foo/bar"). TODO Find out if the problem is with incompatible Node
// versions (16 vs 18).
chdir(__dirname);

///////////
// RUN MAIN
async function main() {
    console.log("Orchestrator starting...")

    // Sentry early initialization so that it can catch errors in the rest of
    // the initialization.
    if (SENTRY_DSN) {
        initSentry(expressApp);
    }

    // Must wait for database before starting to listen for
    // web-clients.
    await initializeDatabase();

    initAndRunDeviceDiscovery();

    express.static.mime
        .define({"application/wasm": ["wasm"]});

    server = expressApp
        .listen(PUBLIC_PORT, async () => {
            console.log(
                "Orchestrator is available at: ",
                PUBLIC_BASE_URI
            );
        });
}

try {
    main()
} catch(e) {
    console.error("Orchestrator failed to start: ", e);
    shutDown();
}

module.exports = {
    getDb: () => database,

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


/*
* Initialize and connect to the database.
*/
async function initializeDatabase() {
    database = new MongoDatabase(MONGO_URI);

    console.log(`Connecting to database through '${MONGO_URI}' ...`);
    try {
        await database.connect();
        console.log("Connected to and initialized database!");
    } catch(e) {
        console.error("Database connection failed", e);
        shutDown();
    }
}

/**
 * Initialize Sentry error reporting, and add it to the express app.
 */
function initSentry(app) {
    const Sentry = require("@sentry/node");
    Sentry.init({
        dsn: SENTRY_DSN,
        environment: process.env.NODE_ENV,
        integrations: [
            // HTTP call tracing
            new Sentry.Integrations.Http({ tracing: true }),
            new Sentry.Integrations.Express({ app }),
            // Automatically instrument Node.js libraries and frameworks
            ...Sentry.autoDiscoverNodePerformanceMonitoringIntegrations(),
        ]
    });

    // RequestHandler creates a separate execution context, so that all
    // transactions/spans/breadcrumbs are isolated across requests
    app.use(Sentry.Handlers.requestHandler());
    // TracingHandler creates a trace for every incoming request
    app.use(Sentry.Handlers.tracingHandler());

    app.get("/sentry.js", (req, res) => {
        res.setHeader("Content-Type", "application/javascript");
        res.send(`
            Sentry.onLoad(function() {
                Sentry.init({
                    dsn: ${JSON.stringify(SENTRY_DSN)},
                    environment: ${JSON.stringify(process.env.NODE_ENV)},
                    integrations: [
                        new Sentry.Integrations.BrowserTracing()
                    ],
                });
            });
        `);
    });

    // The error handler must be before any other error middleware and after all controllers
    //app.use(Sentry.Handlers.errorHandler());
}


/**
 * Create a new device discovery instance and run it.
 * 
 * NOTE: Throws if fails.
 */
function initAndRunDeviceDiscovery() {
    try {
        deviceDiscovery = new discovery.DeviceDiscovery(type=DEVICE_TYPE, database);
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

const jsonMw = express.json();

const urlencodedExtendedMw = express.urlencoded({ extended: true });

// Order the middleware so that for example POST-body is parsed
// before trying to log it.

// Serve the frontend files for use.
expressApp.use(express.static("frontend"));

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

expressApp.get("/files/:myPath", (request, response) => {
    response.sendFile("./files/"+request.params.myPath, { root: "." });
});

if (SENTRY_DSN) {
    // Sentry error handler must be before any other error middleware and after all controllers
    // to get errors from routes.
    const Sentry = require("@sentry/node");
    expressApp.use(Sentry.Handlers.errorHandler());
}

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

    await database.close();
    console.log("Closed database connection.");

    destroyDeviceDiscovery();

    console.log("Orchestrator shutdown finished.");
    process.exit();
}
