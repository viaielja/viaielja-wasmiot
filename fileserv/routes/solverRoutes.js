const express = require("express");
const semver = require("semver");  // For interpreting version ranges
const router = express.Router();

/**
 * Single-file router that:
 *  - Defines a DPLL solver internally
 *  - Exposes one route: POST /solve
 *  - Accepts a "packages" array (human-readable with semver ranges)
 *  - Transforms to CNF behind the scenes
 *  - Solves via DPLL
 *  - Returns SAT or UNSAT with chosen packages if SAT
 */

// ===================== DPLL SOLVER CODE START =====================

class Formula {
  constructor(numVariables = 0, numClauses = 0) {
    // -1 => unassigned, 0 => true, 1 => false
    this.literals = new Array(numVariables).fill(-1);
    // frequency of appearances for each variable
    this.literalFrequency = new Array(numVariables).fill(0);
    // (# of positive) - (# of negative) appearances
    this.literalPolarity = new Array(numVariables).fill(0);
    // clauses, each an array of integer literals (2n => pos, 2n+1 => neg)
    this.clauses = new Array(numClauses).fill(null).map(() => []);
  }

  static copy(other) {
    const f = new Formula();
    f.literals = other.literals.slice();
    f.literalFrequency = other.literalFrequency.slice();
    f.literalPolarity = other.literalPolarity.slice();
    f.clauses = other.clauses.map(clause => clause.slice());
    return f;
  }
}

// Status enum
const Cat = {
  satisfied: 0,
  unsatisfied: 1,
  normal: 2,
  completed: 3
};

class SATSolverDPLL {
  constructor() {
    this.formula = null;
    this.literalCount = 0;
    this.clauseCount = 0;
  }

  initialize(formula, literalCount, clauseCount) {
    this.formula = formula;
    this.literalCount = literalCount;
    this.clauseCount = clauseCount;
  }

  solve() {
    const cloned = Formula.copy(this.formula);
    const result = this.DPLL(cloned);
    if (result === Cat.normal) {
      // If normal => never found a satisfying assignment
      this.showResult(this.formula, Cat.unsatisfied);
    }
  }

  DPLL(f) {
    const result = this.unitPropagate(f);
    if (result === Cat.satisfied) {
      this.showResult(f, result);
      return Cat.completed;
    } else if (result === Cat.unsatisfied) {
      return Cat.normal;
    }

    // Pick var with highest frequency
    let maxIndex = -1;
    let maxVal = -1;
    for (let i = 0; i < f.literalFrequency.length; i++) {
      if (f.literalFrequency[i] > maxVal) {
        maxVal = f.literalFrequency[i];
        maxIndex = i;
      }
    }

    if (maxIndex === -1) {
      // All variables assigned or no variables
      if (f.clauses.length === 0) {
        // All clauses satisfied
        this.showResult(f, Cat.satisfied);
        return Cat.completed;
      }
      return Cat.normal;
    }

    // Try two assignments
    for (let attempt = 0; attempt < 2; attempt++) {
      const newF = Formula.copy(f);
      // If polarity is positive, try val=attempt first
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
        continue; // try opposite assignment
      }

      const dpllResult = this.DPLL(newF);
      if (dpllResult === Cat.completed) {
        return dpllResult;
      }
    }

    return Cat.normal;
  }

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
          // unit clause
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

  applyTransform(f, literalToApply) {
    const assignedValue = f.literals[literalToApply];
    for (let i = 0; i < f.clauses.length; i++) {
      const clause = f.clauses[i];
      for (let j = 0; j < clause.length; j++) {
        const lit = clause[j];
        const varIndex = Math.floor(lit / 2);
        const varPol = lit % 2;

        if (varIndex === literalToApply && varPol === assignedValue) {
          // clause satisfied => remove
          f.clauses.splice(i, 1);
          i--;
          break;
        } else if (varIndex === literalToApply && varPol !== assignedValue) {
          // remove literal
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

  showResult(f, result) {
    if (result === Cat.satisfied) {
      console.log("SAT");
      const assignments = [];
      for (let i = 0; i < f.literals.length; i++) {
        const val = f.literals[i];
        if (val === -1) {
          // treat unassigned as true
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

// We'll reuse parseDimacs if we want, but we won't accept direct CNF from user
function parseDimacs(inputText) {
  // If you want to see how a CNF string is parsed, keep this, else you can remove
  // ... Not used directly for user input now ...
  return { formula: null, literalCount: 0, clauseCount: 0 };
}

// We'll do solve from text, capturing the console output
function solveSATFromText(dimacsString) {
  let output = "";
  const oldLog = console.log;
  console.log = (...args) => {
    output += args.join(" ") + "\n";
  };

  // Parse the dimacs
  const lines = dimacsString.split(/\r?\n/);
  let literalCount = 0;
  let clauseCount = 0;
  const clauseData = [];

  // Basic parse for "p cnf"
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

  // Build the formula
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

  // Solve
  const solver = new SATSolverDPLL();
  solver.initialize(formula, literalCount, clauseCount);
  solver.solve();

  console.log = oldLog;
  return output.trim();
}

function parseSolverOutput(solverOutput, reverseMap) {
  if (solverOutput.startsWith("UNSAT")) {
    return { status: "UNSAT", chosen: [] };
  }

  const lines = solverOutput.split("\n");
  // find a line with integers e.g. "1 -2 3 0"
  const assignmentLine = lines.find(line => /\d/.test(line));
  if (!assignmentLine) {
    return { status: "SAT", chosen: [] };
  }

  const parts = assignmentLine.trim().split(/\s+/); // e.g. ["1", "-2", "3", "0"]
  const chosenVars = [];
  for (let p of parts) {
    const val = parseInt(p, 10);
    if (val === 0) break;
    if (val > 0) {
      // positive => var is true
      chosenVars.push(reverseMap[val]);
    }
  }

  return { status: "SAT", chosen: chosenVars };
}

// =================== TRANSFORM PACKAGES => CNF ===================

function transformPackagesToCNF(packages, options = { exactlyOneVersion: true }) {
  // 1) Group by package name => list of versions
  const grouped = {};
  packages.forEach(pkg => {
    if (!grouped[pkg.name]) grouped[pkg.name] = [];
    grouped[pkg.name].push(pkg.version);
  });

  // 2) Assign var IDs
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

  // Helper to produce a literal
  function lit(varKey, neg) {
    const id = varIDMap.get(varKey);
    return neg ? -id : id;
  }

  const clauses = [];

  // 3) Exactly-one constraints
  for (let pkgName of Object.keys(grouped)) {
    const versions = grouped[pkgName];
    // "at least one" => (v1 OR v2 OR ...)
    if (options.exactlyOneVersion && versions.length > 0) {
      const clause = versions.map(ver => lit(`${pkgName}@${ver}`, false));
      clauses.push(clause);
    }
    // "at most one" => for each pair => (¬v1 OR ¬v2)
    for (let i = 0; i < versions.length; i++) {
      for (let j = i + 1; j < versions.length; j++) {
        clauses.push([ lit(`${pkgName}@${versions[i]}`, true),
                       lit(`${pkgName}@${versions[j]}`, true) ]);
      }
    }
  }

  // 4) Dependencies => if pkg => at least one version of dep
  packages.forEach(pkg => {
    const pkgVar = `${pkg.name}@${pkg.version}`;
    pkg.deps.forEach(dep => {
      // find all valid versions in grouped
      const possibleVers = (grouped[dep.name] || []).filter(v => semver.satisfies(v, dep.range));
      if (possibleVers.length === 0) {
        // no valid => can't install pkg => (¬pkgVar)
        clauses.push([ lit(pkgVar, true) ]);
      } else {
        // (¬pkgVar OR dep@v1 OR dep@v2 ...)
        const clause = [ lit(pkgVar, true) ];
        possibleVers.forEach(v => {
          clause.push(lit(`${dep.name}@${v}`, false));
        });
        clauses.push(clause);
      }
    });
  });

  // 5) Build DIMACS
  const numVariables = varIDMap.size;
  const numClauses = clauses.length;
  let dimacs = `p cnf ${numVariables} ${numClauses}\n`;

  clauses.forEach(c => {
    dimacs += c.join(" ") + " 0\n";
  });

  return { dimacs, reverseMap };
}

// ==================== EXPRESS ROUTE /solve ====================

/**
 * We now expect the client to send:
 * {
 *   "packages": [
 *     { "name": "A", "version": "1.0.0", "deps": [{ "name": "B", "range": "^2.0.0" }] },
 *     ...
 *   ],
 *   "exactlyOneVersion": true  // optional
 * }
 *
 * We transform that to CNF, run the solver, and return which packages are installed if SAT.
 */
router.post("/solve", (req, res) => {
  try {
    const { packages, exactlyOneVersion } = req.body;
    if (!packages || !Array.isArray(packages)) {
      return res.status(400).json({ error: "Missing or invalid 'packages' array" });
    }

    // 1) Transform to CNF
    const { dimacs, reverseMap } = transformPackagesToCNF(packages, {
      exactlyOneVersion: (exactlyOneVersion !== false)
    });

    // 2) Solve
    const solverOutput = solveSATFromText(dimacs);

    // 3) Interpret result
    if (solverOutput.startsWith("UNSAT")) {
      return res.json({ status: "UNSAT", chosen: [], rawOutput: solverOutput });
    }

    const { status, chosen } = parseSolverOutput(solverOutput, reverseMap);
    // chosen is an array of "PkgName@Version"

    // convert to objects
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