const http = require('http');

const bonjour = require("bonjour-service");
const { DEVICE_DESC_ROUTE } = require("../constants.js");


/**
 * Helper for using mDNS to discover and handle __Wasm-IoT__ -devices in the
 * network.
 */
class DeviceDiscovery {
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
        this.queryOptions = { type };
    }

    /**
     * Start browsing for the services and add their descriptions to database as
     * needed. Also set event listeners for browser.
     * TODO browse for http services under the wasmiot-domain instead?
     */
    run() {
        async function onFound(service) {
            // TODO/FIXME: A device is no longer "found" on mDNS after this but the
            // description-query-chain might fail ending up with nothing but nulls
            // in the database...
            console.log(`Found '${service.name}'! `, service);
            this.saveDeviceData(service);
            this.logServices();
        }
        // This is needed in order to refer to outer "this" instead of the
        // bonjour-browser-"this" inside the callback...
        onFound = onFound.bind(this);

        function onDown(service) {
            // Remove service from database once it leaves/"says goodbye".
            console.log("Service emitted 'goodbye' :", service);
            // NOTE: Using IP-addresses as filter for deletion.
            this.database.delete("device", { addresses: service.addresses });
            this.logServices();
        }
        onDown = onDown.bind(this);

        // Bonjour/mDNS sends the queries on its own; no need to send updates
        // manually.
        this.browser = this.bonjourInstance.find(this.queryOptions);
 
        this.browser.on("up", onFound);
        this.browser.on("down", onDown);

        // Log available devices every minute.
        setInterval(this.logServices.bind(this), 60000);

        console.log("mDNS initialized; searching for hosts with ", this.queryOptions);
    }

    logServices() {
        let date = new Date();
        console.log("[", date, "] current services: ", this.browser.services.map(x => x.name)); 
    }

    /**
     * Query information like WoT-description and platform info to be saved into the
     * database from the device.
     * @param {*} serviceData Object containing needed data of the device discovered via mDNS.
     */
    async saveDeviceData(serviceData) {
        // Check for duplicate service
        let device_doc = await this.database.read("device", { name: serviceData.name })[0];

        // Check if __all__ the required information has been received earlier.
        // NOTE: This is not a check to prevent further actions if device already
        // simply exists in database.
        if (device_doc
            && device_doc.hasOwnProperty("description") && device_doc.description !== null
            && device_doc.description.hasOwnProperty("platform") && device_doc.description.platform !== null
        ) {
            console.log(`The device named '${device_doc.name}' is already in the database!`);
            return;
        }

        // Insert or get new device into database for updating in GET-callbacks.
        let newId;
        if (!device_doc) {
            try {
                newId = (await this.database.create("device", [serviceData])).insertedIds[0];
                console.log("Added new device: ", serviceData);
            } catch (e) {
                console.error(e.message);
            }
        } else {
            newId = device_doc._id;
        }

        let requestOptions = { host: serviceData.addresses[0], port: serviceData.port, path: DEVICE_DESC_ROUTE };

        console.log("Querying service's description(s) via HTTP... ", requestOptions);

        // The returned description should follow the common schema for WasmIoT TODO
        // Perform validation.
        this.queryDeviceData(requestOptions, (data) => {
            let deviceDescription;
            try {
                deviceDescription = JSON.parse(data);
            } catch (error) {
                console.log("Error - description JSON is malformed: ", error)
                return;
            }

            // Save description in database. TODO Use some standard way to
            // interact with descriptions (validations, operation,
            // contentType, security etc)?.
            this.database.update(
                "device",
                { _id: newId },
                { description: deviceDescription }
            );
            console.log(`Adding device description for '${serviceData.name}'`);
        });
    }

    /**
     * Query device __for 'data'-events__ and if fails, remove from mDNS-cache.
     * NOTE: This is for device introduction and not for general queries!
     * @param {*} options Options to use in the GET request of `http.get` including the URL.
     * @param {*} callback What to do with the data when request ends.
     */
    queryDeviceData(options, callback) {
        /**
         * Find and forget the service in question whose advertised host failed to
         * answer to HTTP-GET.
         */
        function handleError(responseOrHttpGetError) {
            let statusMsg = responseOrHttpGetError.statusCode ? ": Status " + responseOrHttpGetError.statusCode: ".";
            console.log(`Service at '${options.host}${options.path}' failed to respond${statusMsg}`);

            let faultyServices = this.browser
                .services
                .filter(service => service.addresses.includes(options.host));

            if (faultyServices.length > 0) {
                // FIXME/TODO Bonjour keeps the device saved, but it should forget it
                // here because the device is not functional. Current library does
                // not seem to support removing the found service...
                console.log("UNIMPLEMENTED/TODO: Should forget the faulty devices: ", faultyServices);
            } else {
                console.log(`Did not find any devices with advertised IP ${options.host} in currently known mDNS devices`);
            }
            return null;
        }
        // Sigh...
        handleError = handleError.bind(this);

        http.get(options, (res) => {
            if (res.statusCode !== 200) {
                handleError(res);
            } else {
                let rawData = '';
                res.on('data', (chunk) => { rawData += chunk; });
                res.on('end', () => callback(rawData));
            }
        })
        .on("error", handleError);
    }

    destroy() {
        this.bonjourInstance.destroy();
    }
}

module.exports = {
    DeviceDiscovery,
};