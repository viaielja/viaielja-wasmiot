const fileSystem = require('fs'),
    path = require('path'),
    http = require('http');
const { chdir } = require('process');

const { MongoClient, ObjectId } = require("mongodb");

// Set working directory to this file's root in order to use relative paths
// (i.e. "./foo/bar"). TODO Find out if the problem is with incompatible Node
// versions (16 vs 18).
chdir(__dirname);

const FRONT_END_DIR = path.join(__dirname, "frontend");


/**
 * GET a Wasm-module; used by IoT-devices.
 */
express.get("/file/module/:moduleId", async (request, response) => {
    let doc = await db.module.findOne({ _id: ObjectId(request.params.moduleId) });
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
    let doc = await db.deployment.findOne({ _id: ObjectId(request.params.deploymentId) });
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

async function main() {
    server = express.listen(PORT, async () => {
        // TODO Sometimes database is not ready for server operations. Consult
        // the docker-compose tutorial?
        await initializeDatabase();
        bonjourBrowser = initializeMdns();
        console.log(`Listening on port: ${PORT}`);
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