//run this file to run a single test file

const fs = require("fs");
const { solveSATFromText } = require("./solverRoutes"); 

const dimacsData = fs.readFileSync("cnfTestFile.cnf", "utf8");

const result = solveSATFromText(dimacsData);

console.log("Solver result: ");
console.log(result);