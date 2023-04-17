const { router: device } = require("./device");
const { router: modules } = require("./module");
const { router: deployment } = require("./deployment");
const { router: execution } = require("./execution");

module.exports = {
    device,
    modules,
    deployment,
    execution,
};