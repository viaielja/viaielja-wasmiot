/**
 * Initialize server, database, mDNS and routes as needed.
 */

const { chdir } = require('process');

const express = require("express");

const { MongoDatabase, MockDatabase } = require("./src/database");
const discovery = require("./src/deviceDiscovery");
const { MONGO_URI, PUBLIC_PORT, PUBLIC_BASE_URI, DEVICE_TYPE, FRONT_END_DIR, SENTRY_DSN } = require("./constants.js");


const expressApp = express();

/**
 * The underlying nodejs http-server that app.listen() returns.
 */
let server;

/**
 * For operations on the database connection and its collections.
 */
let database;

/**
 * Thing to use for searching and listing services found (by mDNS).
 */
let deviceDiscovery;

// Set working directory to this file's root in order to use relative paths
// (i.e. "./foo/bar"). TODO Find out if the problem is with incompatible Node
// versions (16 vs 18).
chdir(__dirname);

///////////
// RUN MAIN
async function main() {
    console.log("Orchestrator starting...")

    let testing = process.env.NODE_ENV === "test";
    if (testing) {
        console.log("! RUNNING IN TEST MODE");
    } else {
        // Sentry early initialization so that it can catch errors in the rest of
        // the initialization.
        if (SENTRY_DSN) {
            // Sentry error handler must be before any other error middleware and after all controllers
            // to get errors from routes.
            const Sentry = require("@sentry/node");
            expressApp.use(Sentry.Handlers.errorHandler());

            initSentry(expressApp);

            console.log("Activated Sentry error reporting.");
        } else {
            console.log("Sentry error reporting not activated.");
        }
    }

    // Must (successfully) wait for database before starting to listen for
    // web-clients.
    await initializeDatabase();

    if (!testing) {
        initAndRunDeviceDiscovery();
    }
    
    initServer();
}

main()
    .catch((e) => {
        console.error("Orchestrator failed to start: ", e);
        shutDown();
    });


///////////
// EXPORTS.

module.exports = {
    getDb: () => database,

    /**
     * Reset device discovery so that devices already discovered and running
     * will be discovered again. TODO: Implement probing of devices that are
     * still alive and change into "refresh" (i.e., update address based on
     * name and forget missing ones in scanner) instead of "reset" (i.e.,
     * reinitialize scanning entirely).
     *
     * NOTE: Throws if re-initializing fails.
     */
    resetDeviceDiscovery: function() {
        deviceDiscovery.destroy();
        initAndRunDeviceDiscovery();
    },

    /* This needs to be exported for tests. */
    app: expressApp,
};

// NOTE: This needs to be placed after exports so that the routes defined can
// import the common functionality like database getter etc.
const routes = require("./routes");


//////////////////////////
// INITIALIZATION HELPERS.

/*
* Initialize and connect to the database.
*
* @throws If the connection fails (timeouts).
*/
async function initializeDatabase() {
    // Select between mock and real database in case running tests.
    database = process.env.NODE_ENV === "test"
        ? new MockDatabase()
        : new MongoDatabase(MONGO_URI);

    console.log("Connecting to database: ", database);

    try {
        await database.connect();
        console.log("Database connection success!");
    } catch(e) {
        console.error("Database connection fail.");
        // Propagate to caller.
        throw e;
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
 * Initialize the server exposing orchestrator API.
 */
function initServer() {
    express.static.mime
        .define({"application/wasm": ["wasm"]});

    server = expressApp.listen(PUBLIC_PORT)

    server.on("listening", () => {
        console.log(
            "Orchestrator is available at: ",
            PUBLIC_BASE_URI
        );
    });

    server.on("error", (e) => {
        if (e.code === 'EADDRINUSE') {
            console.error("Server failed to start", e);
            shutDown();
        }
    });
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
        console.log("body: ", request.body);
    }
    next();
}

const urlencodedExtendedMw = express.urlencoded({ extended: true });

// Serve the frontend files for use.
expressApp.use(express.static(FRONT_END_DIR));

expressApp.use(requestMethodLogger);

// All the routes should parse JSON found in the request body.
expressApp.use(express.json());

expressApp.use(urlencodedExtendedMw);

// POST-body needs to be parsed before trying to log it.
expressApp.use(postLogger);

// Feature specific handlers:
expressApp.use("/file/device",   routes.device);
expressApp.use("/file/module",   routes.modules);
expressApp.use("/file/manifest", routes.deployment);
expressApp.use("/execute",       routes.execution);

// NOTE: This is for testing if for example an image file needs to be available
// after execution of some deployed work.
expressApp.get("/files/:myPath", (request, response) => {
    response.sendFile("./files/"+request.params.myPath, { root: "." });
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
 */
async function shutDown() {
    console.log("Orchestrator shutting down...");

    if (server) {
        await server.close();
    }

    if (database) {
        await database.close();
        console.log("Closed database connection.");
    }

    if (deviceDiscovery) {
        deviceDiscovery.destroy();
        console.log("Destroyed the mDNS instance.");
    }
 
    console.log("Finished shutting down.");
    process.exit();
}