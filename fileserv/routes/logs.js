const express = require("express");


let database = null;

let collection = null;

async function setDatabase(db) {
    collection = db.collection("supervisorLogs");
}

/**
 * Endpoint for receiving logs from the supervisor and save them to database.
 */
const createSupervisorLogs = async (req, res) => {
    try {
        const logData = JSON.parse(req.body.logData);
        await collection.insertOne(logData);
        res.status(200).send({ message: 'Log received and saved' });
    } catch (e) {
        console.error(e);
        res.status(500).send({ message: 'Log not received nor saved' });
        return;
    }
}

/**
 * Get all supervisor related logs from the database.
 */
const getSupervisorLogs= async (request, response) => {
    response.json(await database.findAll("supervisorLogs"));
}

const router = express.Router();
router.post("/", createSupervisorLogs);
router.get("/", getSupervisorLogs);


module.exports = { setDatabase, router };
