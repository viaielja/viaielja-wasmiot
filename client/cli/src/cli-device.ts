import { Command } from "commander";


const program = new Command();

program
    .command("scan")
    .description("Scan for device advertisements")
    .action(async () => {
        console.log("I'm scanning");
    });

program
    .showHelpAfterError()
    .parse();