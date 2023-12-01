import { readFile } from "node:fs/promises";

import { Command } from "commander";

import { DefaultService as Api } from "../generatedApiClient";


const program = new Command();

program
    .command("create", "Create a new module")
    .command("desc", "Describe an existing module");

program
    .command("show")
    .description("Return information related to modules")
    .option("-m --module <module-id-string>", "ID of a single module")
    .action(async (options, _) => {
        const result = 
            options.module
            ? await Api.getFileModule1(options.module)
            : await Api.getFileModule();

        console.log(JSON.stringify(result, null, 4));
    });

program
    .showHelpAfterError()
    .parse();