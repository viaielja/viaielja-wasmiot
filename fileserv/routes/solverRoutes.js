/**
 * SAT Solver and Package Dependency Resolution Module
 * 
 * This module implements a SAT solver using the DPLL algorithm to solve
 * CNF formulas. It provides functionality to transform package dependency
 * data into CNF (DIMACS format), solve the SAT problem, and interpret the results.
 * The module exposes a REST endpoint at "/solve" to process package dependencies.
 */

const express = require("express");
const semver = require("semver");
const router = express.Router();

/**
 * Represents a Boolean formula in CNF form.
 * 
 * @class Formula
 */
class Formula {
  /**
   * Creates a new Formula instance.
   * 
   * @constructor
   * @param {number} [numVariables=0] - The number of variables in the formula.
   * @param {number} [numClauses=0] - The number of clauses in the formula.
   * 
   * Initializes:
   * - literals: Array representing the assignment of each variable (-1 for unassigned, 0 for true, 1 for false).
   * - literalFrequency: Array representing the frequency of appearances for each variable.
   * - literalPolarity: Array representing the difference between positive and negative appearances.
   * - clauses: Array of clauses, where each clause is an array of integer literals (even number for positive, odd for negative).
   */
  constructor(numVariables = 0, numClauses = 0) {
    this.literals = new Array(numVariables).fill(-1);
    this.literalFrequency = new Array(numVariables).fill(0);
    this.literalPolarity = new Array(numVariables).fill(0);
    this.clauses = new Array(numClauses).fill(null).map(() => []);
  }

  /**
   * Creates a deep copy of a given Formula instance.
   * 
   * @static
   * @param {Formula} other - The formula instance to copy.
   * @returns {Formula} A new Formula instance with copied data.
   */
  static copy(other) {
    const f = new Formula();
    f.literals = other.literals.slice();
    f.literalFrequency = other.literalFrequency.slice();
    f.literalPolarity = other.literalPolarity.slice();
    f.clauses = other.clauses.map(clause => clause.slice());
    return f;
  }
}

/**
 * Enumeration for clause status used in the SAT solver.
 * 
 * @constant
 */
const Cat = {
  satisfied: 0,
  unsatisfied: 1,
  normal: 2,
  completed: 3
};

/**
 * SATSolverDPLL implements the DPLL algorithm for solving SAT problems.
 * 
 * @class SATSolverDPLL
 */
class SATSolverDPLL {
  /**
   * Creates a new instance of SATSolverDPLL.
   * 
   * @constructor
   */
  constructor() {
    this.formula = null;
    this.literalCount = 0;
    this.clauseCount = 0;
  }

  /**
   * Initializes the SAT solver with a formula, literal count, and clause count.
   * 
   * @param {Formula} formula - The CNF formula to solve.
   * @param {number} literalCount - The number of literals in the formula.
   * @param {number} clauseCount - The number of clauses in the formula.
   */
  initialize(formula, literalCount, clauseCount) {
    this.formula = formula;
    this.literalCount = literalCount;
    this.clauseCount = clauseCount;
  }

  /**
   * Solves the SAT problem using the DPLL algorithm.
   * Clones the current formula and applies DPLL recursion.
   * If the final result is normal (i.e., unsatisfied), it displays the unsatisfied result.
   */
  solve() {
    const cloned = Formula.copy(this.formula);
    const result = this.DPLL(cloned);
    if (result === Cat.normal) {
      this.showResult(this.formula, Cat.unsatisfied);
    }
  }

  /**
   * Implements the recursive DPLL algorithm.
   * Applies unit propagation and then selects the variable with the highest frequency.
   * Tries both possible assignments and recursively continues the search.
   * 
   * @param {Formula} f - The formula to solve.
   * @returns {number} The status after attempting to solve the formula.
   */
  DPLL(f) {
    const result = this.unitPropagate(f);
    if (result === Cat.satisfied) {
      this.showResult(f, result);
      return Cat.completed;
    } else if (result === Cat.unsatisfied) {
      return Cat.normal;
    }

    let maxIndex = -1;
    let maxVal = -1;
    for (let i = 0; i < f.literalFrequency.length; i++) {
      if (f.literalFrequency[i] > maxVal) {
        maxVal = f.literalFrequency[i];
        maxIndex = i;
      }
    }

    if (maxIndex === -1) {
      if (f.clauses.length === 0) {
        this.showResult(f, Cat.satisfied);
        return Cat.completed;
      }
      return Cat.normal;
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      const newF = Formula.copy(f);
      if (newF.literalPolarity[maxIndex] > 0) {
        newF.literals[maxIndex] = attempt;
      } else {
        newF.literals[maxIndex] = (attempt + 1) % 2;
      }
      newF.literalFrequency[maxIndex] = -1;

      const transformResult = this.applyTransform(newF, maxIndex);
      if (transformResult === Cat.satisfied) {
        this.showResult(newF, transformResult);
        return Cat.completed;
      } else if (transformResult === Cat.unsatisfied) {
        continue;
      }

      const dpllResult = this.DPLL(newF);
      if (dpllResult === Cat.completed) {
        return dpllResult;
      }
    }

    return Cat.normal;
  }

  /**
   * Performs unit propagation on the formula.
   * Finds unit clauses and assigns their corresponding literal.
   * Applies transformation after each assignment.
   * 
   * @param {Formula} f - The formula to propagate.
   * @returns {number} The status after unit propagation (satisfied, unsatisfied, or normal).
   */
  unitPropagate(f) {
    if (f.clauses.length === 0) {
      return Cat.satisfied;
    }
    let foundUnit;
    do {
      foundUnit = false;
      for (let i = 0; i < f.clauses.length; i++) {
        if (f.clauses[i].length === 0) {
          return Cat.unsatisfied;
        }
        if (f.clauses[i].length === 1) {
          foundUnit = true;
          const lit = f.clauses[i][0];
          const varIndex = Math.floor(lit / 2);
          const value = lit % 2;
          f.literals[varIndex] = value;
          f.literalFrequency[varIndex] = -1;

          const transformResult = this.applyTransform(f, varIndex);
          if (transformResult === Cat.satisfied || transformResult === Cat.unsatisfied) {
            return transformResult;
          }
          break;
        }
      }
    } while (foundUnit);

    return Cat.normal;
  }

  /**
   * Applies transformation to the formula based on a literal assignment.
   * Removes satisfied clauses and updates clauses by removing the negated literal.
   * 
   * @param {Formula} f - The formula to transform.
   * @param {number} literalToApply - The index of the literal being applied.
   * @returns {number} The status after transformation (satisfied, unsatisfied, or normal).
   */
  applyTransform(f, literalToApply) {
    const assignedValue = f.literals[literalToApply];
    for (let i = 0; i < f.clauses.length; i++) {
      const clause = f.clauses[i];
      for (let j = 0; j < clause.length; j++) {
        const lit = clause[j];
        const varIndex = Math.floor(lit / 2);
        const varPol = lit % 2;
        if (varIndex === literalToApply && varPol === assignedValue) {
          f.clauses.splice(i, 1);
          i--;
          break;
        } else if (varIndex === literalToApply && varPol !== assignedValue) {
          clause.splice(j, 1);
          j--;
          if (clause.length === 0) {
            return Cat.unsatisfied;
          }
          break;
        }
      }
    }
    if (f.clauses.length === 0) {
      return Cat.satisfied;
    }
    return Cat.normal;
  }

  /**
   * Displays the result of the SAT solving process.
   * Logs "SAT" with variable assignments if the result is satisfied, or "UNSAT" otherwise.
   * 
   * @param {Formula} f - The formula containing the assignment.
   * @param {number} result - The result status (Cat.satisfied or Cat.unsatisfied).
   */
  showResult(f, result) {
    if (result === Cat.satisfied) {
      console.log("SAT");
      const assignments = [];
      for (let i = 0; i < f.literals.length; i++) {
        const val = f.literals[i];
        if (val === -1) {
          assignments.push(`${i + 1}`);
        } else {
          const sign = Math.pow(-1, val) * (i + 1);
          assignments.push(sign.toString());
        }
      }
      console.log(assignments.join(" ") + " 0");
    } else {
      console.log("UNSAT");
    }
  }
}

/**
 * Parses a DIMACS formatted input string.
 * 
 * Note: This function is not used directly for user input.
 * 
 * @param {string} inputText - The DIMACS input string.
 * @returns {Object} An object containing the formula, literalCount, and clauseCount.
 */
function parseDimacs(inputText) {
  return { formula: null, literalCount: 0, clauseCount: 0 };
}

/**
 * Solves the SAT problem given a DIMACS string.
 * Captures console output during solving and returns it as a string.
 * 
 * @param {string} dimacsString - The DIMACS formatted string representing the CNF.
 * @returns {string} The output produced by the solver.
 */
function solveSATFromText(dimacsString) {
  let output = "";
  const oldLog = console.log;
  console.log = (...args) => {
    output += args.join(" ") + "\n";
  };

  const lines = dimacsString.split(/\r?\n/);
  let literalCount = 0;
  let clauseCount = 0;
  const clauseData = [];
  let foundHeader = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("p")) {
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 4 && parts[1] === "cnf") {
        literalCount = parseInt(parts[2], 10);
        clauseCount = parseInt(parts[3], 10);
        foundHeader = true;
      }
    } else if (foundHeader) {
      const nums = trimmed.split(/\s+/).map(x => parseInt(x, 10));
      clauseData.push(nums);
    }
  }

  const formula = new Formula(literalCount, clauseCount);
  let idx = 0;
  for (const arr of clauseData) {
    const clause = [];
    for (let v of arr) {
      if (v === 0) break;
      if (v > 0) {
        clause.push(2 * (v - 1));
        formula.literalFrequency[v - 1]++;
        formula.literalPolarity[v - 1]++;
      } else {
        const pos = -v;
        clause.push(2 * (pos - 1) + 1);
        formula.literalFrequency[pos - 1]++;
        formula.literalPolarity[pos - 1]--;
      }
    }
    if (idx < clauseCount) {
      formula.clauses[idx] = clause;
      idx++;
    }
  }

  const solver = new SATSolverDPLL();
  solver.initialize(formula, literalCount, clauseCount);
  solver.solve();

  console.log = oldLog;
  return output.trim();
}

/**
 * Interprets the output from the SAT solver.
 * Extracts variable assignments from the output string.
 * 
 * @param {string} solverOutput - The raw output from the solver.
 * @param {Array} reverseMap - A mapping from variable IDs to package strings.
 * @returns {Object} An object with status ("SAT" or "UNSAT") and an array of chosen package strings.
 */
function parseSolverOutput(solverOutput, reverseMap) {
  if (solverOutput.startsWith("UNSAT")) {
    return { status: "UNSAT", chosen: [] };
  }

  const lines = solverOutput.split("\n");
  const assignmentLine = lines.find(line => /\d/.test(line));
  if (!assignmentLine) {
    return { status: "SAT", chosen: [] };
  }

  const parts = assignmentLine.trim().split(/\s+/);
  const chosenVars = [];
  for (let p of parts) {
    const val = parseInt(p, 10);
    if (val === 0) break;
    if (val > 0) {
      chosenVars.push(reverseMap[val]);
    }
  }

  return { status: "SAT", chosen: chosenVars };
}

/**
 * Transforms package dependency information into a CNF (DIMACS) representation.
 * Groups packages by name, assigns variable IDs, and creates clauses for:
 * - "At least one" version per package (if exactlyOneVersion is true)
 * - "At most one" version per package
 * - Dependency relations between packages and their valid versions
 * 
 * @param {Array} packages - An array of package objects. Each package should have "name", "version", and "deps" properties.
 * @param {Object} [options={ exactlyOneVersion: true }] - Options for transformation.
 * @returns {Object} An object containing the DIMACS string and a reverseMap of variable IDs to package strings.
 */
function transformPackagesToCNF(packages, options = { exactlyOneVersion: true }) {
  const grouped = {};
  packages.forEach(pkg => {
    if (!grouped[pkg.name]) grouped[pkg.name] = [];
    grouped[pkg.name].push(pkg.version);
  });

  let nextVarID = 1;
  const varIDMap = new Map();
  const reverseMap = [];
  Object.keys(grouped).forEach(pkgName => {
    grouped[pkgName].forEach(ver => {
      const key = `${pkgName}@${ver}`;
      varIDMap.set(key, nextVarID);
      reverseMap[nextVarID] = key;
      nextVarID++;
    });
  });

  function lit(varKey, neg) {
    const id = varIDMap.get(varKey);
    return neg ? -id : id;
  }

  const clauses = [];
  for (let pkgName of Object.keys(grouped)) {
    const versions = grouped[pkgName];
    if (options.exactlyOneVersion && versions.length > 0) {
      const clause = versions.map(ver => lit(`${pkgName}@${ver}`, false));
      clauses.push(clause);
    }
    for (let i = 0; i < versions.length; i++) {
      for (let j = i + 1; j < versions.length; j++) {
        clauses.push([ lit(`${pkgName}@${versions[i]}`, true),
                       lit(`${pkgName}@${versions[j]}`, true) ]);
      }
    }
  }

  packages.forEach(pkg => {
    const pkgVar = `${pkg.name}@${pkg.version}`;
    pkg.deps.forEach(dep => {
      const possibleVers = (grouped[dep.name] || []).filter(v => semver.satisfies(v, dep.range));
      if (possibleVers.length === 0) {
        clauses.push([ lit(pkgVar, true) ]);
      } else {
        const clause = [ lit(pkgVar, true) ];
        possibleVers.forEach(v => {
          clause.push(lit(`${dep.name}@${v}`, false));
        });
        clauses.push(clause);
      }
    });
  });

  const numVariables = varIDMap.size;
  const numClauses = clauses.length;
  let dimacs = `p cnf ${numVariables} ${numClauses}\n`;
  clauses.forEach(c => {
    dimacs += c.join(" ") + " 0\n";
  });

  return { dimacs, reverseMap };
}

/**
 * POST /solve
 * HOX: the actual orchestrator route should be /solver/solve eg. localhost:3000/solver/solve
 * See app.js for the /solver part
 * Transforms package dependency data into CNF, solves the SAT problem using the DPLL algorithm,
 * and returns the installation result in JSON format.
 * 
 * Expected request body:
 * {
 *   "packages": [
 *     { "name": "A", "version": "1.0.0", "deps": [{ "name": "B", "range": "^2.0.0" }] },
 *     ...
 *   ],
 *   "exactlyOneVersion": true  // Optional: if false, does not enforce exactly one version.
 * }
 * 
 * Response:
 * - If UNSAT, returns a JSON with status "UNSAT" and the raw solver output.
 * - If SAT, returns a JSON with status "SAT", an array of chosen packages, and the raw solver output.
 */
router.post("/solve", (req, res) => {
  try {
    const { packages, exactlyOneVersion } = req.body;
    if (!packages || !Array.isArray(packages)) {
      return res.status(400).json({ error: "Missing or invalid 'packages' array" });
    }

    const { dimacs, reverseMap } = transformPackagesToCNF(packages, {
      exactlyOneVersion: (exactlyOneVersion !== false)
    });

    const solverOutput = solveSATFromText(dimacs);
    if (solverOutput.startsWith("UNSAT")) {
      return res.json({ status: "UNSAT", chosen: [], rawOutput: solverOutput });
    }

    const { status, chosen } = parseSolverOutput(solverOutput, reverseMap);
    const chosenPackages = chosen.map(str => {
      const [name, version] = str.split("@");
      return { name, version };
    });

    res.json({
      status,
      chosen: chosenPackages,
      rawOutput: solverOutput
    });
  } catch (err) {
    console.error("Error in /solve route:", err);
    res.status(500).json({
      error: "Internal Server Error",
      details: err.message
    });
  }
});

module.exports = {
  router,
  solveSATFromText,
};
