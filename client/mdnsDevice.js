const os = require('os');
const util = require('util');
const http = require('http');
const express = require("express")();
const bonjour = require("bonjour")();

const { IOT_HOST_DOMAIN } = require("../fileserv/utils");

/**
 * Name identifying this device on the network.
 */
const HOSTNAME = (() => {
    const process = require("process");
    const deviceName = `device-${process.ppid}-${process.pid}`;
    return `${deviceName}.${IOT_HOST_DOMAIN}`;
})();

let port = 3001;
if (process.argv.length > 2) {
    port = Number.parseInt(process.argv.at(2));
}
console.log(`${HOSTNAME}: starting HTTP-server and mDNS publish...`);

express.get("/description", (_, response) => {
    response.send({ "architecture": "intel i7", "platform": "Windows 11", "repository": "TODO What dis?", "peripherals": [] });
});

express.get("/*", (_, response) => {
    // TODO This would be computed in WebAssembly.
    response.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset='utf-8'>
  <title>Wasm-IoT</title>
</head>
<body>
  <p>Wasm-IoT - Device<br/>Your random number is ${Math.random() * 100}</p>
</body>
</html>`);
})

// Start server to respond to description-queries.
express.listen(port, () => {
    console.log(`Serving HTTP on port ${port}`)
});

// Start advertising this device.
const serviceInfo = { name: "Random Number Generator Box 100", port: port, type: "http" };
bonjour.publish(serviceInfo);
console.log(`Advertising the following service info: ${JSON.stringify(serviceInfo)}`);