import { Command } from "commander";


const program = new Command();

program
    .name("cli")
    .description("Command line interface for orchestrator API")
    .command("module", "Operate on modules")
    .command("device", "Operate on devices")
    .command("deployment", "Operate on deployments")
    .showHelpAfterError()
    .parse();
