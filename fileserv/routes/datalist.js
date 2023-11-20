/**
 * Define the descriptions and implementation of Datalist core service.
 */

const { readFile } = require("node:fs/promises");
const utils = require("../utils");

let collection = null;

async function setDatabase(db) {
    collection = db.collection("supervisorData");
}

/**
 * Initialize empty list for pushing data to later.
 * @param {*} request
 * @param {*} response
 */
const initData = async (request, response) => {
    let { insertedId } = await collection.insertOne({ history: [] });
    response.json({ result: { id: insertedId } });
};

/**
 * Return the datalist stored based on id or a specific entry if index is given.
 * @param {*} request
 * @param {*} response
 */
const getData = async (request, response) => {
    let id = request.params.dataId;
    let index = request.params.index;

    let history;
    try {
        let { history: theHistory } = await collection.findOne({ _id: id });
        history = theHistory;
    } catch (error) {
        console.log("Error reading data from database: ", error);
        response.status(400).json(new utils.Error("Error reading datalist from database.", error));
        return;
    }

    let data;
    if (index) {
        data = history[index];
    } else {
        data = history;
    }

    response.json(data);
};

/**
 * Add data in request to list for others to retrieve later.
 * @param {*} request
 * @param {*} response
 */
const pushData = async (request, response) => {
    let id = await readFile(request.files.find(x => x.name == "id").path, encoding="utf-8");
    let entry = await readFile(request.files.find(x => x.name == "entry").path, encoding="utf-8");
    // Handle the update async so that the response can be sent immediately.
    // FIXME: This operation is not atomic, so if two requests are made at the
    // same time, one of them will be overwritten! Using MongoDB's $push would
    // be preferred but also requires to stronger commit into using it...
    collection.updateOne({ _id: id }, { $push: { history: entry } });
    response.status(202).send();
};

/**
 * Delete the datalist stored based on id.
 * @param {*} request
 * @param {*} response
 */
const deleteData = async (request, response) => {
    let id = request.params.dataId;
    collection.deleteOne({ _id: id });

    response.status(202).send();
};


const FUNCTION_DESCRIPTIONS = {
    init: {
        parameters: [],
        method: "POST",
        // TODO: All these octet streams should eventually be JSON instead of
        // just storing/retrieving integers.
        output: "application/octet-stream",
        mounts: [
            {
                name: "id",
                mediaType: "application/octet-stream",
                stage: "output"
            }
        ],
        func: initData
    },
    push: {
        parameters: [],
        method: "PUT",
        output: "application/octet-stream",
        mounts: [
            {
                name: "id",
                mediaType: "application/octet-stream",
                stage: "execution"
            },
            {
                name: "entry",
                mediaType: "application/octet-stream",
                stage: "execution",
            }
        ],
        func: pushData
    },
    get: {
        parameters: [],
        method: "GET",
        output: "application/octet-stream",
        mounts: [
            {
                name: "id",
                mediaType: "application/octet-stream",
                stage: "execution"
            },
            {
                name: "entry",
                mediaType: "application/octet-stream",
                stage: "output",
            }
        ],
        func: getData
    },
    delete: {
        parameters: [],
        method: "DELETE",
        output: "application/octet-stream",
        mounts: [
            {
                name: "id",
                mediaType: "application/octet-stream",
                stage: "execution",
            }
        ],
        func: deleteData
    },
};

const MODULE_NAME = "Datalist";

module.exports = {
    MODULE_NAME,
    FUNCTION_DESCRIPTIONS,
    setDatabase
};