module.exports = {
    bonjour,
    bonjourBrowser,
    databaseClient,
    db,
    express,
    server,
};

const bonjour = require('bonjour')();
const express = require("express")();

/**
 * Way to operate on the collections in database.
 */
let db = {
    device: null,
    module: null,
    deployment: null,
};

/**
 * The underlying nodejs http-server that app.listen() returns.
 */
let server;

/**
 * Browser to use for example for listing or unpublishing services found by mDNS.
 */
let bonjourBrowser;

/**
 * For initializations and closing the database connection on shutdown.
 */
let databaseClient;

