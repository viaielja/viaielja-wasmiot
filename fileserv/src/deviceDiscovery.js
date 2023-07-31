const bonjour = require("bonjour-service");
const { DEVICE_DESC_ROUTE, DEVICE_HEALTH_ROUTE } = require("../constants.js");


/**
 * Interface to list available devices and send them messages.
 *
 * "Device" is used as a term for a thing running the Wasm-IoT supervisor.
 *
 * Uses mDNS for discovering devices.
 */
class DeviceManager {
    /**
     * Initialize fields needed in querying for IoT-devices.
     * @param type The type of mDNS service to search for.
     * @param database Reference to the database to save devices into.
     */
    constructor(type, database) {
        if (!type || !database) {
            throw "device type or database missing from device discovery constructor!";
        }
        this.bonjourInstance = new bonjour.Bonjour();
        this.browser = null;
        this.database = database;
        // This is where the needed data on available devices is stored TODO: is
        // the database even needed then?
        this.devices = [];
        this.queryOptions = { type };
    }

    /**
     * Start browsing for the services and save their descriptions to database as
     * needed. Also set handling when a "well behaving" device leaves the
     * discovery's reach.
     */
    startDiscovery() {
        // Bonjour/mDNS sends the queries on its own; no need to send updates
        // manually.
        this.browser = this.bonjourInstance.find(this.queryOptions);
 
        // This is needed in order to refer to outer "this" instead of the
        // bonjour-browser-"this" inside the callback...
        this.browser.on("up", this.#saveDevice.bind(this));
        this.browser.on("down", this.#forgetDevice.bind(this));

        // Check the status of the services every 2 minutes. (NOTE: This is
        // because the library used does not seem to support re-querying the
        // services on its own).
        setInterval(this.healthCheck.bind(this), 120000);

        console.log("mDNS initialized; searching for hosts with ", this.queryOptions);
    }

    /**
     * Transform the data of a service into usable device data and query needed
     * additional information like WoT-description and platform.
     * @param {*} serviceData Object containing needed data of the service discovered via mDNS.
     */
    #saveDevice(serviceData) {
        let newDevice = this.#addNewDevice(serviceData);
        // Check for duplicate or unknown (i.e., non-queried) device.
        if (!newDevice) {
            console.log(`Service '${serviceData.name}' is already known!`);
            return;
        }

        this.#deviceIntroduction(newDevice);
    }

    /**
     * Based on found service, create a device entry of it if the device is not
     * already known.
     * @param {*} serviceData 
     * @returns The device entry created or null if the device is already fully
     * known.
     */
    #addNewDevice(serviceData) {
        if (!this.devices[serviceData.name]) {
            // Transform the service into usable device data.
            this.devices[serviceData.name] = {
                // Devices are identified by their "fully qualified" name.
                id: serviceData.name,
                communication: {
                    addresses: serviceData.addresses,
                    port: serviceData.port,
                }
            };
        } else {
            let device = this.devices[serviceData.name];
            if (device.description && device.description.platform) {
                return null;
            }
        }

        return this.devices[serviceData.name];
    }

    /**
     * Perform tasks for device introduction.
     * 
     * Query device __for 'data'-events__ on its description path and if fails,
     * remove from mDNS-cache.
     * @param {*} device The device to introduce.
     */
    async #deviceIntroduction(device) {
        const handleIntroductionErrorBound = (function handleIntroductionError(errorMsg) {
                // Find and forget the service in question whose advertised
                // host failed to answer to HTTP-GET.
                console.log(" Error in device introduction: ", errorMsg);
                this.#forgetDevice(device.id);
            })
            .bind(this);

        // FIXME: Using first address but might want to try all available.
        let url = new URL(`http://${device.communication.addresses[0]}:${device.communication.port}`);
        url.pathname = device.deviceDescriptionPath || DEVICE_DESC_ROUTE;

        console.log("Querying device description via GET", url.toString());

        let res = await fetch(url);
        if (res.status !== 200) {
            handleIntroductionErrorBound(
                `${JSON.stringify(device.communication, null, 2)} responded ${res.status} ${res.statusText}`
            );
            return;
        }

        let deviceDescription;
        try {
            // The returned description should follow the common schema for
            // WasmIoT TODO Perform validation.
            deviceDescription = await res.json();
        } catch (error) {
            handleIntroductionErrorBound(`description JSON is malformed: ${error}`);
            return;
        }

        this.devices[device.id].description = deviceDescription;

        console.log(`Added description for device '${device.id}'`);

        // Do an initial health check on the new device.
        this.healthCheck(device.id);
    }

    /**
     * Force refresh of device discovery so that devices already discovered and
     * running will be discovered again.
     * 
     * @throws If re-initializing scanning fails.
     */
    refresh() {
        this.destroy();

        this.bonjourInstance = new bonjour.Bonjour();
        this.startDiscovery();
    }

    destroy() {
        this.bonjourInstance.destroy();
        this.devices = {};
    }

    /**
     * Check and update "health" of currently known devices.
     * TODO: This should be restful in that the one running in interval should
     * not clash with direct calls.
     * @param {*} deviceId Id of the device to check. If not given, check all.
     */
    async healthCheck( deviceId) {
        let devices = deviceId ? [this.devices[deviceId]] : this.devices;

        let date = new Date();
        let healthChecks = devices.map(x => ({
                device: x.id,
                // Gather promises to be awaited.
                check: this.#healthCheckDevice(x),
                timestamp: date,
            }));

        for (let x of healthChecks) {
            try {
                let health = await x.check;
                this.devices[x.device].health = {
                    report: health,
                    timeOfQuery: x.timestamp,
                };
            } catch (e) {
                console.log(`Forgetting device '${x.device}' with health problems:`, e);
                this.#forgetDevice(x.device);
            }
        }

        console.log("[", date, "] current number of devices: ", Object.keys(this.devices).length); 
    }


    /**
     * Forget a device based on an identifier or one derived from mDNS service data.
     * @param {*} x The string-identifier or service data of the device to forget. 
     */
    #forgetDevice(x) {
        let key = null;
        if (typeof x === "string") {
            key = x;
        } else {
            console.log(`Service '${service.name}' seems to have emitted 'goodbye'`);
            // Assume the service data from mDNS is used to remove a device.
            key = x.name;
        }

        delete this.devices[key];
    }


    /**
     * Query the device for health
     * @param {*} device The device to query.
     * @throws If there were error querying the device.
     */
    async #healthCheckDevice(device) {
        let url = new URL(`http://${device.communication.addresses[0]}:${device.communication.port}/${device.healthCheckPath || DEVICE_HEALTH_ROUTE}`);
        let res = await fetch(url);

        if (res.status !== 200) {
            throw `${url.toString()} responded ${res.status} ${res.statusText}`
        }

        return res.json();
    }
}

class MockDeviceDiscovery {
    run() { console.log("Running mock device discovery..."); };
    destroy() { console.log("Destroyed mock device discovery."); };
}

module.exports = {
    DeviceDiscovery: DeviceManager,
    MockDeviceDiscovery,
};