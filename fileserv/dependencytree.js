const { Console } = require('console'); //for better console output
const { create } = require('domain');
const util = require('util');


const semver = require('semver');
const { version } = require('os');
const { versions } = require('process');
path = require('path');
fileSystem = require('fs');

var tree = [];
//modules for testing
var modules =
    [{
        "id": "dht22_logger",
        "architecture": "aarch64",
        "version": "1.0.0",
        "platform": "linux",
        "interfaces": ["humidity_sensor", "temperature_sensor"],
        "dependencies": [{
            "networking": {
                "version": "1.0.0"
            }
        },
        {
            "supplement": {
                "version": "1.0.0"
            }
        },
        {
            "test_module": {
                "version": "1.0.0"
            }
        }

        ],
        "peripherals": ["dht22"]
    },
    {
        "id": "networking",
        "architecture": "aarch64",
        "platform": "linux",
        "interfaces": ["networking"],
        "peripherals": [],
        "dependencies": [{
            "supplement": {
                "version": "1.0.0"
            }
        }
        ]
    },
    {
        "id": "supplement",
        "architecture": "aarch64",
        "platform": "linux",
        "interfaces": ["networking"],
        "peripherals": [],
        "dependencies": [{
            "networking": {
                "version": "1.0.0"
            }
        }]
    }
    ];


var testModule = JSON.parse(getModuleWithVersion("dht22_logger", "1.0.2"));
var testList = getAllDependencies(testModule, traversed = new Set());

console.log(testList)

// 
function checkMatches(list, req) {
    var matches = [];
    for (var i in list) {


        if (list[i].id == Object.keys(req)) {
            matches.push(list[i].version)
        }
    }
    return matches;
};

function getAllDependencies(module, traversed) {
    let dependencies = module.dependencies || [];
    let allDependencies = dependencies.map(dependency => {
      let dep = Object.entries(dependency)[0];
      let dependencyName = dep[0];
      let dependencyVersion = dep[1].version;
      let dependencyModule = JSON.parse(getModuleWithVersion(dependencyName, dependencyVersion));
      if (traversed.has(`${dependencyModule.id}:${dependencyModule.version}`)) {
        return [];
      }
      traversed.add(`${dependencyModule.id}:${dependencyModule.version}`);
      return getAllDependencies(dependencyModule, traversed);
    });
    return [module].concat(allDependencies.flat());
  }
// Recursively builds a list of a module and its dependencies
function makeTree(node, list = []) {
    // Get the list of module dependencies
    const reqs = node.dependencies;
  
    // Create an object for the current module and add it to the list
    const module = {
      id: node.id,
      version: node.version,
    };
    list.push(module);
  
    // Recursively process each dependency
    if (reqs.length > 0) {
      for (const req of reqs) {
        // Check if the dependency is already in the list
        const depId = Object.keys(req)[0];
        const depVersion = getValues(req, 'version')[0];
        const depInList = getObjects(list, 'id', depId)[0];
  
        // If the dependency is not already in the list, add it
        if (!depInList) {
          makeTree(JSON.parse(getModuleWithVersion(depId, depVersion)), list);
        }
        // If the dependency is in the list but has a different version, add it as a separate item
        else if (depInList.version !== depVersion) {
          makeTree(JSON.parse(getModuleWithVersion(depId, depVersion)), list);
        }
      }
    }
  
    return list;
  }


function getTree(node) {

    let reqs = []
    let h = {
        dependencies: [],
        id: node.id,
        version: node.version
    }


    reqs = node.dependencies;

    if (!isEmpty(node.dependencies[0])) {

        node.dependencies.forEach((req) => {

            var dependencyWithVersion =
            {
                id: Object.keys(req)[0],
                version: getValues(req, "version")[0]
            }

            if (Object.keys(req)[0] == undefined) {
                return {};
            }
            console.log(req)
            console.log(getValues(req, "version"));
            if (getValues(tree, 'id').includes(Object.keys(req)[0]) && !getValues(tree, 'version').includes(Object.keys(req)[0].version)) {


                var position = Object.keys(tree).indexOf(Object.keys(req)[0]);


                tree.push(dependencyWithVersion);
                tree.push({ id: h.id, version: h.version });

                return tree;
            };

            if (getValues(tree, 'id').includes(Object.keys(req)[0]) && getValues(tree, 'version').includes(Object.keys(req)[0].version)) {
                console.log("AAAAAAAAAAAAAAAA");
                return tree;

            }




            tree.push(dependencyWithVersion);
            tree.push({ id: h.id, version: h.version });

            h.dependencies.push(getTree(
                JSON.parse(getModuleWithVersion(Object.keys(req)[0], getValues(req, "version")[0])), tree))
        })

        return tree;
    }


    h = {
        id: node.id
    }
    return h;
}



//Groups a list of objects by matching keys  
function groupBy(xs, key) {
    return xs.reduce(function (rv, x) {
        (rv[x[key]] = rv[x[key]] || []).push(x);
        return rv;
    }, {});
}



// Returns an array of values that match a certain key
function getValues(obj, key) {
    const values = [];
  
    for (const prop in obj) {
      // Ignore inherited properties
      if (!Object.prototype.hasOwnProperty.call(obj, prop)) {
        continue;
      }
  
      if (typeof obj[prop] === 'object') {
        // Recursively get values for nested objects
        values.push(...getValues(obj[prop], key));
      } else if (prop === key) {
        // Add the value to the array if the key matches
        values.push(obj[prop]);
      }
    }
  
    return values;
  }

// Returns true if an object is empty, i.e., has no own properties
function isEmpty(obj) {
    // Check if the object has any own properties
    for (const prop in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, prop)) {
        // If the object has at least one own property, it is not empty
        return false;
      }
    }
  
    return JSON.stringify(obj) === JSON.stringify({});
  }



// Returns a module as a JSON object based on its name and version from the local module library
function getModuleWithVersion(modulename, version) {

    // Returns the JSON for a module based on its name and version
    function getModuleJSON(modulename, version) {
      // If either `modulename` or `version` is falsy, log an error message and return the module with the same name.
      if (!modulename || !version) {
        console.log("No such version " + modulename + version);
        return getModuleByName(modulename);
      }
      // Construct the file path for the module's `modulemetadata.json` file based on its name and version
      const startpath = path.join(__dirname, 'modules');
      const fixedVersion = modulename + "-" + version;
      const truepath = path.join(startpath, modulename, fixedVersion, 'modulemetadata.json');
      // Read the module metadata from the file system and parse it as JSON
      return fileSystem.readFileSync(truepath, 'UTF-8', function (err, data) {
        if (err) return console.log(err + "NO SUCH MODULE");
        manifest = JSON.parse(data);
      });
    }
  
    return getModuleJSON(modulename, version);
  }


//@return module with matching name as json object
function getModuleByName(modulename) {

    //returns the json from a module based on the name
    function getModuleJSON(modulename) {
        let startpath = path.join(__dirname, 'modules');

        var truepath = path.join(startpath, modulename, 'modulemetadata.json');
        return fileSystem.readFileSync(truepath, 'UTF-8', function (err, data) {
            if (err) return console.log(err + "NO SUCH MODULE");
            manifest = JSON.parse(data);
        });
    }

    return getModuleJSON(modulename);

}


//searches a tree recursively for an object matching the keyword
function searchTree(element, matchingTitle) {
    console.log(element);
    console.log(matchingTitle)
    if (element.ID == matchingTitle) {
        return element;
    } else if (element.ID != null) {
        var i;
        var result = null;
        for (i = 0; result == null && i < element.dependencies.length; i++) {
            result = searchTree(element.dependencies[i], matchingTitle);
        }
        return result;
    }
    return null;
}

//return an array of values that match on a certain key
function getValues(obj, key) {
    var objects = [];
    for (var i in obj) {
        if (!obj.hasOwnProperty(i)) continue;
        if (typeof obj[i] == 'object') {
            objects = objects.concat(getValues(obj[i], key));
        } else if (i == key) {
            objects.push(obj[i]);
        }
    }
    return objects;
}


//return an array of objects according to key, value, or key and value matching
function getObjects(obj, key, val) {
    var objects = [];
    for (var i in obj) {
        if (!obj.hasOwnProperty(i)) continue;
        if (typeof obj[i] == 'object') {
            objects = objects.concat(getObjects(obj[i], key, val));
        } else
            //if key matches and value matches or if key matches and value is not passed (eliminating the case where key matches but passed value does not)
            if (i == key && obj[i] == val || i == key && val == '') { //
                objects.push(obj);
            } else if (obj[i] == val && key == '') {
                //only add if the object is not already in the array
                if (objects.lastIndexOf(obj) == -1) {
                    objects.push(obj);
                }
            }
    }
    return objects;
}


exports.groupBy = groupBy;
exports.getAllDependencies = getAllDependencies;