const { router: device } = require("./device");
const { router: modules } = require("./module");
const { router: deployment } = require("./deployment");

console.log(device);
console.log(modules);
console.log(deployment);

module.exports = {
    device,
    modules,
    deployment,
};