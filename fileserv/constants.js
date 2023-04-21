/**
 * Read in environment variables and define constants based on them.
 * Also contains some static values used in the system.
 */

const path = require("path");

const mongo_host = process.env.CONFIG_MONGODB_HOST || "mongo";
const mongo_port = process.env.CONFIG_MONGODB_PORT || "27017";
const mongo_user = process.env.CONFIG_MONGODB_ADMINUSERNAME;
const mongo_pass = process.env.CONFIG_MONGODB_ADMINPASSWORD;
const MONGO_URI = `mongodb://${mongo_user}:${mongo_pass}@${mongo_host}:${mongo_port}/`;

const public_host = process.env.CONFIG_PUBLIC_HOST || `http://${require("os").hostname()}`;
const PUBLIC_PORT = process.env.CONFIG_PUBLIC_PORT || "3000";
const PUBLIC_BASE_URI = `${public_host}:${PUBLIC_PORT}/`;

const MODULE_DIR = path.join(__dirname, "files", "wasm");
const FRONT_END_DIR = path.join(__dirname, "frontend");

// NOTE: "webthing" is what the JS-library returns as type for Flask-host's
// "_webthing._tcp.local.", soooo search for those.
const DEVICE_TYPE = "webthing";
// TODO: Use dot after "local" or no?
const DEVICE_DESC_ROUTE = "/.well-known/wasmiot-device-description";
const DEVICE_WOT_ROUTE = "/.well-known/wot-thing-description";




module.exports = {
    MONGO_URI,
    PUBLIC_PORT,
    PUBLIC_BASE_URI,
    MODULE_DIR,
    DEVICE_DESC_ROUTE,
    DEVICE_TYPE,
    FRONT_END_DIR,
};
