const mdns = require('multicast-DNS')();
const util = require('util');

console.log("Starting mdns...");

const os = require('os');
const IP = os.networkInterfaces()["lo"][0]["address"];
const {ORCHESTRATOR_NAME} = require("../fileserv/utils");

/**
 * Some information identifying this device.
 */
const deviceInfo = (() => {
    const process = require("process");
    return `${process.ppid}>#${process.pid},${IP}`;
})();

mdns.on("response", (response) => {
    for (answer of response.answers) {
        if (answer.type === "A") {
            let logmsg = `Device ${deviceInfo} received ${answer.type} `
            if (answer.name === ORCHESTRATOR_NAME) {
                logmsg += `from assumed orchestrator: ${answer.data}`;
                // TODO:
                // 1) Save the received orchestrator info,
                // 2) respond with device CoRE description,
                // 3) start endpoint to begin deployment,
                // 4) upon deployment, query for modules.
                mdns.destroy();
                console.log(`Device ${deviceInfo} destroyed its mDNS instance!`);
            } else if (answer.data === IP) {
                logmsg += `from its own IP address: ${answer.data}`;
                // Ignore
            } else {
                logmsg += `from unknown host: ${answer.data}`;
                // TODO Is this event concerning?
            }
            console.log(logmsg);
        } else {
            console.log(`Device ${deviceInfo} received type '${answer.type}' response`);
        }
    }
});

mdns.on("query", (query) => {
    console.log(`Device ${deviceInfo} received query:  ${util.inspect(query)}`);
    // For now, respond with own IP-address.
    mdns.respond({
            answers: [{
                name: `Device:${deviceInfo}`,
                type: "A",
                data: IP,
            }]
        },
        () => {
            console.log(`${deviceInfo}: Responding to query...`);
        }
    )
});


// "Advertise this device" by searching for the orchestration server's
// IP-Address (hence type 'A'). TODO Maybe user SRV-record instead? see:
// https://www.cloudflare.com/learning/dns/dns-records/dns-srv-record/
mdns.query({
    questions:[{
        name: "wasmiot-orchestrator.local",
        type: "A"
    }] 
});

console.log("Done!");