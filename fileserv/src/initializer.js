/*
 * This file is used to clear the database and initialize it with data.
 */

const fs = require("fs");
const { INIT_FOLDER } = require("../constants.js");

const DEVICE = "device";
const MODULE = "module";
const DEPLOYMENT = "deployment";


async function clearCollection(collection) {
    // collection.ge
    let { deletedCount } = await collection.deleteMany();
    console.log(`Deleted ${deletedCount} items.`);
}

async function addDataToCollection(collection, data) {
    let { insertedCount } = await collection.insertMany(data);
    console.log(`Inserted ${insertedCount} items.`);
}

function loadJsonData(folder) {
    let files = [];
    try {
        files = fs.readdirSync(folder);
    }
    catch (error) {
        console.error(`Failed to read the folder: ${folder}`);
        return [];
    }

    let data = [];
    for (let file of files) {
        if (!file.endsWith(".json")) {
            continue;  // ignore non-JSON files
        };

        try {
            let content = fs.readFileSync(`${folder}/${file}`);
            let parsed = JSON.parse(content);

            // only consider objects or arrays of objects
            if (parsed && parsed.constructor === Object) {
                data.push(parsed);
            }
            else if (parsed.constructor === Array) {
                for (let item of parsed) {
                    if (item && item.constructor === Object) {
                        data.push(item);
                    }
                }
            }
            else {
                console.error(`Invalid JSON data in file: ${file}`);
            }
        }
        catch (error) {
            console.error(`Failed to read ${file}.`);
        }
    }

    // NOTE: no validation for the data is done here.
    return data;
}

async function initDevices(database) {
    const deviceCollection = database.collection(DEVICE);
    const deviceData = loadJsonData(`${INIT_FOLDER}/${DEVICE}`);
    if (deviceData.length > 0) {
        console.log("Clearing devices from the database.");
        await clearCollection(deviceCollection);
        console.log(`Adding ${deviceData.length} devices to the database.`);
        await addDataToCollection(deviceCollection, deviceData);
    }
    else {
        console.log("No initial device data found. Leaving the database as is.");
    }
}

module.exports = {
    initDevices
};
