// measureCnfTests.js
const fs = require("fs");
const path = require("path");
const { performance } = require("perf_hooks");

// Import the solver function from solverRoutes.js
const { solveSATFromText } = require("./solverRoutes");

// List your CNF test folders here:
const testFolders = ["cnftest1", "cnftest2", "cnftest3"]; 
// Add more folder names if you have them, e.g. "cnftest3", ...

testFolders.forEach((folderName) => {
  const folderPath = path.join(__dirname, folderName);

  // We'll accumulate times to compute an average
  const times = [];
  let fileCount = 0;

  console.log(`\n===== Testing folder: ${folderName} =====`);

  let files;
  try {
    files = fs.readdirSync(folderPath);
  } catch (err) {
    console.error(`Error reading folder "${folderName}":`, err);
    return;
  }

  // Process each file in this folder
  files.forEach((file) => {
    if (path.extname(file) !== ".cnf") {
      // Skip non-.cnf files
      return;
    }

    const filePath = path.join(folderPath, file);
    try {
      const dimacsData = fs.readFileSync(filePath, "utf8");

      // Measure time to solve
      const start = performance.now();
      const result = solveSATFromText(dimacsData);
      const end = performance.now();

      const elapsedMs = end - start;
      times.push(elapsedMs);
      fileCount++;

      // Print the result for this file
      console.log(`\n=== File: ${file} ===`);
      console.log(result);
      console.log(`Time taken: ${elapsedMs.toFixed(2)} ms`);
    } catch (readOrSolverError) {
      console.error(`Error processing file "${file}":`, readOrSolverError);
    }
  });

  // After processing each .cnf file in this folder, compute the average time
  if (fileCount > 0) {
    const totalTime = times.reduce((acc, ms) => acc + ms, 0);
    const avgTime = totalTime / fileCount;
    console.log(`\nFolder "${folderName}" summary: processed ${fileCount} file(s).`);
    console.log(`Average time per file: ${avgTime.toFixed(2)} ms`);
  } else {
    console.log(`No .cnf files found in folder "${folderName}".`);
  }
});
