import { readFile, writeFile } from "node:fs/promises";

import { Command } from "commander";

import { DefaultService as Api } from "../generatedApiClient";


const program = new Command();

program
    .command("create")
    .description("Create a new module")
    .argument("<module-name-string>", "Name to give to module")
    .argument("<input-file>", "Path to module's .wasm file")
    .action(async (name, wasmPath) => {
        const wasm = await readFile(wasmPath);
        const wasmBlob = new Blob([wasm], { type: "application/wasm" });
        const result = await Api.postFileModule({
            name, wasm: wasmBlob
        });
        console.log(JSON.stringify(result, null, 4));
    });

program
    .command("desc")
    .description("Describe an existing module")
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
    .command("rm")
    .description("Remove all modules")
    .action(async () => {
        const result = await Api.deleteFileModule();

        console.log(JSON.stringify(result, null, 4));
    })

program
    .command("file")
    .description("Fetch an associated file")
    .argument("<module-id-string>", "ID of the module")
    .argument("<file-name>", "Name of an associated file")
    .argument("<output-file>", "Path where to save the fetched file")
    .action(async (id, name, outputPath) => {
        const result = await Api.getFileModule2(id, name);
        const bytes = await result.arrayBuffer();
        const buffer = Buffer.from(bytes);
        await writeFile(outputPath, buffer);

        console.log(`Wrote ${buffer.length} bytes`);
    })

program
    .showHelpAfterError()
    .parse();