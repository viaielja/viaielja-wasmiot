const express = require("express")();
const bonjour = require("bonjour")();

/**
 * Name identifying this device on the network.
 */
const HOSTNAME = require("os").hostname();

/**
 * Type of service to advertise self as.
 * ...Apparently this JS-library is not the same as the python-counterpart
 * which can use "_webthing._tcp.local."
 */
const SERVICE_TYPE = "webthing";//"_webthing._tcp.local.";

let port = 3001;
let maxNum = 100;
if (process.argv.length > 2) {
    port = Number.parseInt(process.argv.at(2));
}
if (process.argv.length > 3) {
    maxNum = Number.parseInt(process.argv.at(3));
}
console.log(`${HOSTNAME}: starting HTTP-server and mDNS publish...`);

express.get("/.well-known/wot-thing-description", (_, response) => {
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
  <p>Wasm-IoT - Device<br/>Your random number is ${Math.random() * maxNum}</p>
</body>
</html>`);
})

// Start server to respond to description-queries.
const SERVER = express.listen(port, () => {
    console.log(`Serving HTTP on port ${port}`)
});

// Start advertising this device.
const serviceInfo = { name: `RNG-Box ${maxNum}`, port: port, type: SERVICE_TYPE };
bonjour.publish(serviceInfo);
console.log(`Advertising the following service info: ${JSON.stringify(serviceInfo)}`);


// Handle shutdown when stopping from Docker desktop.
process.on("SIGTERM", () => {
    SERVER.close((err) => {
        // Shutdown the mdns
        if (err) {
            console.log(`Errors from earlier 'close' event: ${err}`);
        }
        console.log("Closing server...");
    });

    // This seems to be synchronous because no callback provided(?)
    bonjour.destroy();
    console.log("Destroyed the mDNS instance.");

    console.log("Done!");
});