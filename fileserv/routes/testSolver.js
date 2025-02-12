const fs = require("fs");
const { solveSATFromText } = require("./solverRoutes"); 

const dimacsData = fs.readFileSync("cnfTestFile.cnf", "utf8");

// 2. Solve
const result = solveSATFromText(dimacsData);

// 3. Print the solver's output
console.log("Solver result:");
console.log(result);