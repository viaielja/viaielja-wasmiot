import { readFile } from "node:fs/promises";

import { Command } from "commander";

import { DefaultService as Api } from "../generatedApiClient";


const program = new Command();

program
    .command("create")
    .description(`Create a new deployment
Manifest sequence can be either submitted from a file or with options that
combine together in the order given e.g. '-d a -m x -f g -d b -m y -f h' will
create the sequence [(a x g), (b y h)]`)
    .argument("<deployment-name-string>", "Name to give to deployment")
    .option("--file <manifest-file>", "Path to deployment's JSON-manifest")
    .option("-d --device [device-id...]", "Device to use")
    .option("-m --module [module-id...]", "Module to use")
    .option("-f --func [function-name...]", "Function to call")
    .action(async (name, options, _) => {
        const sequence = options.file
            ? JSON.parse(
                await readFile(options.file, "utf8"))
            // Zip the 3 arrays together.
            : options.device
                .map((d: string, i: number) => ({
                        device: d,
                        module: options.module[i],
                        func: options.func[i],
                    }));
        const result = await Api.postFileManifest({
            name, sequence
        });
        console.log(JSON.stringify(result, null, 4));
    });

program
    .command("show")
    .description("Return information related to deployments")
    .option("-d --deployment <deployment-id-string>", "ID of a single deployment")
    .action(async (options, _) => {
        const result = 
            options.deployment
            ? await Api.getFileManifest1(options.deployment)
            : await Api.getFileManifest();

        console.log(JSON.stringify(result, null, 4));
    });

program
    .command("rm")
    .description("Remove all deployments")
    .action(async () => {
        const result = await Api.deleteFileManifest();

        console.log(JSON.stringify(result, null, 4));
    })

program
    .showHelpAfterError()
    .parse();
