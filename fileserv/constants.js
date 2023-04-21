/**
 * Read in environment variables and define constants based on them.
 */

const mongo_host = process.env.CONFIG_MONGODB_HOST || "mongo";
const mongo_port = process.env.CONFIG_MONGODB_PORT || "27017";
const mongo_user = process.env.CONFIG_MONGODB_ADMINUSERNAME;
const mongo_pass = process.env.CONFIG_MONGODB_ADMINPASSWORD;
const MONGO_URI = `mongodb://${mongo_user}:${mongo_pass}@${mongo_host}:${mongo_port}/`;

const public_host = process.env.CONFIG_PUBLIC_HOST || `http://${require("os").hostname()}`;
const public_port = process.env.CONFIG_PUBLIC_PORT || "3000";
const PUBLIC_BASE_URI = `${public_host}:${public_port}/`;

module.exports = {
    MONGO_URI,
    PUBLIC_BASE_URI
};
