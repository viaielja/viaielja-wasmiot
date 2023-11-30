import { Command } from "commander";


const program = new Command();

program
    .command("scan", "Scan for device advertisements")
    .showHelpAfterError()
    .parse();