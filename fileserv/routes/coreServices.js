/**
 * This module contains the routes for "core services" that come with the
 * orchestrator and thus needn't be separately uploaded as modules.
 *
 * Each service is attached with a supervisor-compatible description like any
 * other WebAssembly module on the orchestrator, and is mixed into the module
 * database.
 */

const express = require("express");

const utils = require("../utils.js");


const COLLECTION_NAME = "coreServices";

let serviceIds = [];

let database = null;

/**
 * Set the reference to database AND add "modules" describing these core
 * services.
 * @param {*} db
 */
async function setDatabase(db) {
    database = db;

    let datalistServiceDescription = DATALIST_MODULE_DESCRIPTION;
    let datalistEndpointDescriptions = utils.moduleEndpointDescriptions(
        { name: datalistServiceDescription.name },
        DATALIST_FUNCTION_DESCRIPTIONS
    );
    datalistServiceDescription.description = datalistEndpointDescriptions;

    let coreServices = [datalistServiceDescription];
    // Delete and refresh all core services at initialization.
    await database.delete(COLLECTION_NAME)
    let id = (await database.create("coreServices", coreServices))
        .insertedIds[0];
    serviceIds.push(id);
    let services = await database.read(COLLECTION_NAME);
    console.log("Created core services", services.map(x => x.name));
}

const DATALIST_FUNCTION_DESCRIPTIONS = {
    init: {
        parameters: [],
        method: "POST",
        output: "application/json",
        mounts: {
            id: {
                mediaType: "application/json",
                stage: "output"
            }
        },
    },
    push: {
        parameters: [],
        method: "PUT",
        output: "application/json",
        mounts: {
            id: {
                mediaType: "application/json",
                stage: "execution"
            },
            entry: {
                mediaType: "application/json",
                stage: "execution",
            }
        },
    },
    get: {
        parameters: [],
        method: "GET",
        output: "application/json",
        mounts: {
            id: {
                mediaType: "application/json",
                stage: "execution"
            },
            entry: {
                mediaType: "application/json",
                stage: "output",
            }
        },
    },
    delete: {
        parameters: [],
        method: "DELETE",
        output: "application/json",
        mounts: {
            id: {
                mediaType: "application/json",
                stage: "execution",
            }
        },
    },
};

const DATALIST_MODULE_DESCRIPTION = {
    name: "Datalist",
    exports: [
        {
            name: "init",
            parameterCount: 0,
        },
        {
            name: "push",
            parameterCount: 1,
        },
        {
            name: "get",
            parameterCount: 1,
        },
        {
            name: "delete",
            parameterCount: 1,
        },
    ],
    requirements: [],
    wasm: {
        originalFilename: "datalist.orchestrator",
        fileName: undefined,
        path: undefined,
    },
    dataFiles: {},
    // NOTE: Added later.
    description: null,
    mounts: {
        init: DATALIST_FUNCTION_DESCRIPTIONS.init.mounts,
        push: DATALIST_FUNCTION_DESCRIPTIONS.push.mounts,
        get: DATALIST_FUNCTION_DESCRIPTIONS.get.mounts,
        delete: DATALIST_FUNCTION_DESCRIPTIONS.delete.mounts,
    }
};

/**
 * Return list of the core modules that orchestrator provides on its own.
 * @param {*} request
 * @param {*} response
 */
const getCoreServices = async (request, response) => {
    response.json(await database.read("coreServices"));
};

/**
 * Initialize empty list for pushing data to later.
 * @param {*} request
 * @param {*} response
 */
const initData = async (request, response) => {
    let id = (await database.create("supervisorData", [{ history: [] }]))
        .insertedIds[0];
    response.json({ id: id });
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
        history = (await database.read("supervisorData", { _id: id }))[0].history;
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
    let id = request.params.dataId;
    // Handle the update async so that the response can be sent immediately.
    // FIXME: This operation is not atomic, so if two requests are made at the
    // same time, one of them will be overwritten! Using MongoDB's $push would
    // be preferred but also requires to stronger commit into using it...
    let { history } = (await database.read("supervisorData", { _id: id }))[0];
    let updatedHistory = history.concat([request.body]);
    database.update("supervisorData", { _id: id }, { history: updatedHistory });
    response.status(202).send();
};

/**
 * Delete the datalist stored based on id.
 * @param {*} request
 * @param {*} response
 */
const deleteData = async (request, response) => {
    let id = request.params.dataId;
    database.delete("supervisorData", { _id: id });

    response.status(202).send();
};

const router = express.Router();
router.get("/core", getCoreServices);
router.post("/datalist", initData);
router.get("/datalist/:dataId/:index?", getData);
router.put("/datalist/:dataId", pushData);
router.delete("/datalist/:dataId", deleteData);

module.exports = { setDatabase, router, COLLECTION_NAME };
