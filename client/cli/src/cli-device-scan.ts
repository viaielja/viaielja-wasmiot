import { Command } from "commander";


const program = new Command();

program
    .action(async () => {
        console.log("I'm scanning");
    });

program
    .showHelpAfterError()
    .parse();