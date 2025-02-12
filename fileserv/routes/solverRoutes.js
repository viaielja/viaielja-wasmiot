const express = require("express");
const { FalseExpr, TrueExpr, Var, Not, And, Or, Impl, solve } = require("../src/resolver"); // Use "../src/resolver"

const router = express.Router();


//You can fetch the available packages at your desired orchestrator by using curl to save the current packages available like so: curl -X GET http://localhost:3000/file/module | jq '[.[] | {name: .name, description: .description.info.version}]' > testiajo.json
router.post("/solve", (req, res) => {
    try {
        const { packages, dependencies, conflicts } = req.body;

        //check all fields exist
        if (!packages || !dependencies || !conflicts) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        let packageVars = {};
        packages.forEach(pkg => {
            packageVars[pkg] = new Var(pkg);
        });

        // Ensure dependencies reference only existing packages
        for (let dep of dependencies) {
            if (!packageVars[dep.from] || !packageVars[dep.to]) {
                return res.status(400).json({ error: `Dependency ${dep.from} → ${dep.to} references a missing package.` });
            }
        }

        // Ensure conflicts reference only existing packages as a workaround. In truth we don't need to care about this but I left it in for now
        for (let conflict of conflicts) {
            if (!packageVars[conflict[0]] || !packageVars[conflict[1]]) {
                return res.status(400).json({ error: `Conflict between ${conflict[0]} and ${conflict[1]} references a missing package.` });
            }
        }

        // Construct dependencies and conflicts for a single package
        let dependencyExprs = dependencies.map(dep => 
            new Impl(packageVars[dep.from], packageVars[dep.to])
        );

        //Construct an explicit conflict. These are not used as of yet but will probably be required
        let conflictExprs = conflicts.map(conflict => 
            new Not(new And([packageVars[conflict[0]], packageVars[conflict[1]]]))
        );

        // Solve the problem with the given expressions
        const problem = new And([...dependencyExprs, ...conflictExprs]);
        const result = solve(problem);

        if (result) {
            const installedPackages = Object.keys(result).filter(pkg => result[pkg] === true);
            res.json({ solution: installedPackages });
        } else {
            res.json({ solution: null, message: "No valid package configuration found." });
        }
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
});

module.exports = router;
