/**
 * Define the descriptions and implementation of Datalist core service.
 */


let database;
async function setDatabase(db) {
    database = db;
}

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


const FUNCTION_DESCRIPTIONS = {
    init: {
        parameters: [],
        method: "POST",
        // TODO: All these octet streams should eventually be JSON instead of
        // just storing/retrieving integers.
        output: "application/octet-stream",
        mounts: {
            id: {
                mediaType: "application/octet-stream",
                stage: "output"
            }
        },
        func: initData
    },
    push: {
        parameters: [],
        method: "PUT",
        output: "application/octet-stream",
        mounts: {
            id: {
                mediaType: "application/octet-stream",
                stage: "execution"
            },
            entry: {
                mediaType: "application/octet-stream",
                stage: "execution",
            }
        },
        func: pushData
    },
    get: {
        parameters: [],
        method: "GET",
        output: "application/octet-stream",
        mounts: {
            id: {
                mediaType: "application/octet-stream",
                stage: "execution"
            },
            entry: {
                mediaType: "application/octet-stream",
                stage: "output",
            }
        },
        func: getData
    },
    delete: {
        parameters: [],
        method: "DELETE",
        output: "application/octet-stream",
        mounts: {
            id: {
                mediaType: "application/octet-stream",
                stage: "execution",
            }
        },
        func: deleteData
    },
};

const MODULE_DESCRIPTION = {
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
        init: FUNCTION_DESCRIPTIONS.init.mounts,
        push: FUNCTION_DESCRIPTIONS.push.mounts,
        get: FUNCTION_DESCRIPTIONS.get.mounts,
        delete: FUNCTION_DESCRIPTIONS.delete.mounts,
    }
};

module.exports = {
    MODULE_DESCRIPTION,
    FUNCTION_DESCRIPTIONS,
    setDatabase
};