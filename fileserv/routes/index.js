/**
 * Inject dependencies into routes' global/module scope because Javascript
 * "classes" and the this-keyword are horrible.
 */

const device = require("./device");
const modules = require("./module");
const deployment = require("./deployment");
const execution = require("./execution");


/* Set common dependencies between the API routes. */
function init(routeDependencies) {
    device.setDatabase(routeDependencies.database);
    device.setDeviceDiscovery(routeDependencies.deviceDiscovery);

    modules.setDatabase(routeDependencies.database);

    deployment.setDatabase(routeDependencies.database);
    deployment.setOrchestrator(routeDependencies.orchestrator);

    execution.setDatabase(routeDependencies.database);

    return {
        device: device.router,
        modules: modules.router,
        deployment: deployment.router,
        execution: execution.router
    };
}

module.exports = { init };