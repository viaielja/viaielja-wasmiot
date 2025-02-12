
// Expression Classes 
class FalseExpr {
    eval() {
        return false;
    }
}

class TrueExpr {
    eval() {
        return true;
    }
}

class Var {
    constructor(name) {
        this.name = name;
    }
}

class Not {
    constructor(expr) {
        this.expr = expr;
    }
}

class And {
    constructor(exprs) {
        this.exprs = exprs;
    }
}

class Or {
    constructor(exprs) {
        this.exprs = exprs;
    }
}

class Impl {
    constructor(p, q) {
        this.p = p;
        this.q = q;
    }
}

// Little helpers
function free(expr) {
    if (expr instanceof FalseExpr || expr instanceof TrueExpr) {
        return new Set();
    } else if (expr instanceof Var) {
        return new Set([expr.name]);
    } else if (expr instanceof Not) {
        return free(expr.expr);
    } else if (expr instanceof And || expr instanceof Or) {
        return expr.exprs.reduce((acc, subExpr) => new Set([...acc, ...free(subExpr)]), new Set());
    } else if (expr instanceof Impl) {
        return new Set([...free(expr.p), ...free(expr.q)]);
    } else {
        throw new TypeError("Invalid expression type");
    }
}

//placeholder for any Variable that has not been yet locked into False or True
function anyVar(expr) {
    const variables = Array.from(free(expr)).sort();
    return variables.length > 0 ? variables[0] : null;
}

function replace(expr, name, value) {
    if (expr instanceof FalseExpr) {
        return new FalseExpr();
    } else if (expr instanceof TrueExpr) {
        return new TrueExpr();
    } else if (expr instanceof Var) {
        return expr.name === name ? (value ? new TrueExpr() : new FalseExpr()) : new Var(expr.name);
    } else if (expr instanceof Not) {
        return new Not(replace(expr.expr, name, value));
    } else if (expr instanceof And) {
        return new And(expr.exprs.map(subExpr => replace(subExpr, name, value)));
    } else if (expr instanceof Or) {
        return new Or(expr.exprs.map(subExpr => replace(subExpr, name, value)));
    } else if (expr instanceof Impl) {
        return new Impl(replace(expr.p, name, value), replace(expr.q, name, value));
    } else {
        throw new TypeError("Invalid expression type");
    }
}

// Evaluate an expression into a boolean values from the expression Class
function evalExpr(expr) {
    if (expr instanceof FalseExpr) {
        return false;
    } else if (expr instanceof TrueExpr) {
        return true;
    } else if (expr instanceof Var) {
        throw new Error(`Variable ${expr.name} has not been replaced.`);
    } else if (expr instanceof Not) {
        return !evalExpr(expr.expr);
    } else if (expr instanceof And) {
        return expr.exprs.every(subExpr => evalExpr(subExpr));
    } else if (expr instanceof Or) {
        return expr.exprs.some(subExpr => evalExpr(subExpr));
    } else if (expr instanceof Impl) {
        return !evalExpr(expr.p) || evalExpr(expr.q);
    } else {
        throw new TypeError("Invalid expression type");
    }
}


//the main solver function
function solver(expr, bindings) {
    const freeVar = anyVar(expr);
    if (freeVar === null) {
        return evalExpr(expr) ? bindings : null;
    } else {
        // Try replacing with true
        const tExpr = replace(expr, freeVar, true);
        const tBindings = { ...bindings, [freeVar]: true };
        const tResult = solver(tExpr, tBindings);
        if (tResult) return tResult;

        // Try replacing with false
        const fExpr = replace(expr, freeVar, false);
        const fBindings = { ...bindings, [freeVar]: false };
        return solver(fExpr, fBindings);
    }
}

function solve(expr) {
    return solver(expr, {});
}


//TESTING area


// Define package versions as variables
const foo_v1_0 = new Var("foo-1.0");
const foo_v2_0 = new Var("foo-2.0");
const bar_v1_0 = new Var("bar-1.0");
const bar_v2_0 = new Var("bar-2.0");



// Define dependencies
const dependencies = new And([
    new Impl(foo_v1_0, bar_v1_0), // foo-1.0 → bar-1.0
    new Impl(foo_v2_0, bar_v2_0), // foo-2.0 → bar-2.0
]);

// Define conflicts 
const conflicts = new And([
    new Not(new And([foo_v1_0, foo_v2_0])), // Cannot have both foo-1.0 and foo-2.0
    new Not(new And([bar_v1_0, bar_v2_0])), // Cannot have both bar-1.0 and bar-2.0
]);

// Combine into a single problem expression
const problem = new And([dependencies, conflicts]);

// Solve the problem
const result = solve(problem);

// Extract installed packages
if (result) {
    const installedPackages = Object.keys(result).filter(pkg => result[pkg] === true);
    console.log("Resolved packages:", installedPackages);
} else {
    console.log("No solution exists.");
}

// Exports
module.exports = {
    FalseExpr,
    TrueExpr,
    Var,
    Not,
    And,
    Or,
    Impl,
    free,
    anyVar,
    replace,
    evalExpr,
    solver,
    solve,
};