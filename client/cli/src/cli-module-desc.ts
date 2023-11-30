import { Command } from "commander";


const program = new Command();

program
    .argument("<module-id-string>", "ID of the module")
    .action(async () => {
        console.error("Not implemented");
    });

program
    .showHelpAfterError()
    .parse();