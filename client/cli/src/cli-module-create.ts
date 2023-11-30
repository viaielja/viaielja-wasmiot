import { readFile } from "node:fs/promises";

import { Command } from "commander";

import { DefaultService as Api } from "../generatedApiClient";


const program = new Command();

program
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
    .showHelpAfterError()
    .parse();