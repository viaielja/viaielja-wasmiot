const bonjour = require("bonjour-service");
const express = require("express")();

/**
 * Name identifying this device on the network.
 */
const HOSTNAME = require("os").hostname();

/**
 * Type of service to advertise self as.
 */
const SERVICE_TYPE = "webthing";

let port = 3001;
let maxNum = 100;
if (process.argv.length > 2) {
    port = Number.parseInt(process.argv.at(2));
}
if (process.argv.length > 3) {
    maxNum = Number.parseInt(process.argv.at(3));
}

express.get("/.well-known/wasmiot-device-description", (_, response) => {
    let description = {
        "architecture": "intel i7",
        "platform": "Windows 11",
        "repository": "TODO What dis?",
        "peripherals": []
    };
    response.send(description);
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
  <p>Wasm-IoT - Device<br/>Your random number is ${Math.random() * maxNum}</p>
</body>
</html>`);
})


let service;
let bonjourInstance;
// "Main". Start server to respond to description-queries.
const server = express.listen(port, () => {
    console.log(`Serving HTTP on port ${port}. Starting service publishing...`)
    bonjourInstance = new bonjour.Bonjour();
    const serviceInfo = { name: `Test device ${maxNum}`, port: port, type: SERVICE_TYPE };
    service = bonjourInstance.publish(serviceInfo);
    console.log("Service up! Advertising the following service info:", serviceInfo);
});


function shutdown() {
    server.close((err) => {
        // Shutdown the mdns
        if (err) {
            console.log(`Errors from earlier 'close' event: ${err}`);
        }
        console.log("HTTP server closed.");

        service.stop(_ => {
            console.log("Stopped mDNS service.");
            bonjourInstance.destroy();
            console.log("Destroyed the mDNS instance. Exiting...");
            process.exit();
        });
    });
}

// Handle shutdown when stopping from Docker desktop.
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);