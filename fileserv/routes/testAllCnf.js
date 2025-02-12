// test every cnf file in directory
const fs = require("fs");
const path = require("path");

const { solveSATFromText } = require("./solverRoutes");

const cnfFolder = path.join(__dirname, "cnf_tests");

fs.readdir(cnfFolder, (err, files) => {
  if (err) {
    console.error("Error reading cnf_tests folder:", err);
    return;
  }

  files.forEach((file) => {
    if (path.extname(file) !== ".cnf") {
      return; 
    }

    const filePath = path.join(cnfFolder, file);

    try {
      const dimacsData = fs.readFileSync(filePath, "utf8");

      const result = solveSATFromText(dimacsData);

      console.log(`\n=== File: ${file} ===`);
      console.log(result);
    } catch (readOrSolverError) {
      console.error(`Error processing file ${file}:`, readOrSolverError);
    }
  });
});
