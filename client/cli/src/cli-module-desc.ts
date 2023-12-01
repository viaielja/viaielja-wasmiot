import { readFile } from "node:fs/promises";

import { Command } from "commander";

import { DefaultService as Api } from "../generatedApiClient";


const program = new Command();

program
    .argument("<module-id-string>", "ID of the module")
    .argument("<description-file>", "Path to JSON file describing functions of the module")
    .action(async (id, descPath) => {
        const descObj = JSON.parse(
            await readFile(descPath, "utf8")
        );
        const result = await Api.postFileModuleUpload(id, descObj);
        console.log(JSON.stringify(result, null, 4));
    });

program
    .showHelpAfterError()
    .parse();