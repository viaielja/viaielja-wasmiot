import { Command } from "commander";

import { DefaultService as Api } from "../generatedApiClient";


const program = new Command();

program
    .command("show")
    .description("Return information related to devices")
    .action(async () => {
        const result = await Api.getFileDevice();
        console.log(JSON.stringify(result, null, 4));
    });

program
    .command("scan")
    .description("Scan for device advertisements")
    .action(async () => {
        await Api.postFileDeviceDiscoveryReset();
        console.log("Rescan started");
    });

program
    .command("rm")
    .description("Delete all devices")
    .action(async () => {
        const result = await Api.deleteFileDevice();
        console.log(JSON.stringify(result, null, 4));
    });

program
    .showHelpAfterError()
    .parse();