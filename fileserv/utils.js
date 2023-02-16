const path = require('path');
const FILE_ROOT = path.join(__dirname, "files");
const MODULE_DIR = "module";
const MANIFEST_DIR = "manifest";
// TODO: Use dot after "local" or no?
const ORCHESTRATOR_NAME = "orchestrator-wasmiot.local.";
const DEVICE_DESC_ROUTE = "/.well-known/wot-thing-description";
// NOTE: "webthing" is what the JS-library returns as type for Flask-host's
// "_webthing._tcp.local.", soooo search for those.
const DEVICE_TYPE = "webthing";

module.exports = {
    respondWithFile,
    queryDeviceData,
    saveDeviceData,
    initializeDatabase,
    initializeMdns,
    initializeServer,
    FILE_ROOT,
    MODULE_DIR,
    MANIFEST_DIR,
    ORCHESTRATOR_NAME,
    DEVICE_DESC_ROUTE,
    DEVICE_TYPE,
};


/// Perform boilerplate tasks when responding with a file read from filesystem.
function respondWithFile(response, filePath, contentType) {
    response.status(200)
        .type(contentType)
        .sendFile(filePath);
}

function reducer(dependency, version) {
    if (!dependency[version]) {
        dependency.push(version);
    }
    else return null;

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

            bonjourBrowser.services.find(x => x.host == options.host).stop(() => {
                console.log("Unpublished service: " + JSON.stringify(service));
            });

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

/**
 * Adapted from:
 * https://www.mongodb.com/developer/languages/javascript/node-connect-mongodb/
 */
async function initializeDatabase() {
    let { databaseClient, db } = require("./globals");

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
    }
}

function initializeServer() {
    let { express } = require("./globals");
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

    // MIDDLEWARES (Note: call-order matters!):
    // Enable JSON-body parsing (NOTE: content-type by default has to be application/json).
    express.use(require("express").json());
    express.use(requestLogger);
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
        console.log(`Found '${service.name}'! ${JSON.stringify(service, null, 2)}`);
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
