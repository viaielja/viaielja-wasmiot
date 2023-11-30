import { Command } from "commander";


const program = new Command();

program
    .command("create", "Create a new module")
    .command("desc", "Describe an existing module");

program
    .showHelpAfterError()
    .parse();