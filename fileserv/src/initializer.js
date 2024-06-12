/*
 * This file is used to clear the database and initialize it with data.
 */

const fs = require("fs");
const { ObjectId,  } = require("mongodb");
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
    function addObjectToList(itemList, item, filename) {
        if (item && item.constructor === Object) {
            if (item._id) {
                item._id = ObjectId(item._id);
            }
            itemList.push(item);
        }
        else {
            console.error(`Invalid JSON data in file: ${filename}`);
        }
    }

    function addDataToList(itemList, dataItem) {
        // only consider objects or arrays of objects
        if (dataItem && dataItem.constructor === Array) {
            for (let item of dataItem) {
                addObjectToList(itemList, item);
            }
        }
        else {
            addObjectToList(itemList, dataItem);
        }
    }

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
            addDataToList(data, parsed);
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
    // set all device heath check time to the current time
    const timestamp = new Date();
    for (let device of deviceData) {
        if (device.health && device.health.timeOfQuery) {
            device.health.timeOfQuery = timestamp;
        }
    }

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
