import { Command } from "commander";


const program = new Command();

program
    .name("cli")
    .description("Command line interface for orchestrator API")
    .command("module", "Operate on modules")
    .command("device", "Operate on devices")
    .showHelpAfterError()
    .parse();
