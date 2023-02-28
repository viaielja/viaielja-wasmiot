const { Console, groupCollapsed } = require('console');
const { chdir } = require('process');

var http = require('http'),
    fileSystem = require('fs'),
    path = require('path'),
    dependencytree = require('./dependencytree.js'),
    semver = require('semver');
    
    chdir(__dirname);




const getDirectories = srcPath => fileSystem.readdirSync(srcPath).filter(file => fileSystem.statSync(path.join(srcPath, file)).isDirectory());

//searches the server for modules that satisfy device description and manifest
function startSearch() {
    var listOfModules = getDirectories("./modules"); //get name of the directories of every module
    var deviceManifest = JSON.parse(getManifest());  //get device manifest as JSON
    var roles = deviceManifest.roles; //get roles from manifest
    var finalList = [];
    var requiredPackages = [];

    // for each role in the manifest, get the specific modules for requested interfaces
    for (var i in roles) {
        //check if interface matches
        var requiredDeviceInterface = roles[i].role_config.interface
        var requiredModule = findModuleForDeviceInterface(requiredDeviceInterface, listOfModules);
        console.log("Added module -> "  +  requiredModule.id + " with version :  " +  requiredModule.version   + "  to list of required packages");
        requiredPackages.push({id : requiredModule.id,version : requiredModule.version, role : i});
    }
    
    console.log("Here are the required packages ");
    console.log(requiredPackages);
    
    
    // loop through REQUIREDPACKAGES and pass id and version to another function
    requiredPackages.forEach(function(package) {
        let role = package.role;
        let packages = dependencytree.getAllDependencies(
            JSON.parse(getModuleWithVersion(package.id, package.version)), traversed = new Set())


        finalList.push({role: role, packages : dependencytree.groupBy(packages, "id") });
    });
    
    console.log(finalList);
    
    return finalList;
}


// This function searches for a module in the given list that satisfies the required device interface
function findModuleForDeviceInterface(requiredDeviceInterface, listOfModules) {   
    let interfaceFound = checkInterfaces(requiredDeviceInterface, listOfModules);
    while (!interfaceFound) { 
        console.log("Interface not found");
        interfaceFound = checkInterfaces(requiredDeviceInterface, listOfModules);
    }
    console.log("Interface found!" + interfaceFound);
    return interfaceFound;
}



let checkInterfaces = (requiredDeviceInterface, moduleList) => {
    for (let i = 0; i < requiredDeviceInterface.length; i++) {
        for (let j = 0; j < moduleList.length; j++) {
            const moduleJSON = JSON.parse(getModuleJSON(moduleList[j], "1.0.0"));
            const moduleInterfaces = moduleJSON.interfaces;
            if (moduleInterfaces.includes(requiredDeviceInterface)) {
                console.log(`module -> ${moduleJSON.id} contains ${requiredDeviceInterface}`);
                return moduleJSON;
            }
        }
    }
    return false;
}




//checks if architecture matches
let checkArchitecture = (moduleMetadata, deviceDescription) => {
    return moduleMetadata.architecture === deviceDescription.architecture;
}

//checks if platform matches
let checkPlatform = (moduleMetadata, deviceDescription) => {
    return moduleMetadata.platform === deviceDescription.platform;
}

//checks if peripherals of device are a subset of the module peripherals
let checkPeripherals = (moduleMetadata, deviceDescription) => {
    if (isSubset(deviceDescription.peripherals, moduleMetadata.peripherals)) {
        console.log("Module peripherals match!");
        return true;
    }
    else { console.log("module peripherals do not match"); return false; }
}

function makeSemverDepList(groupedList) {
    keys = Object.keys(groupedList);
    depList = [];


    keys.forEach((key, index) => {

        console.log()

        let versionList = {
            id: key,
            versions:

                //todo add condition if version is already in
                makeVersionList(groupedList[key])
        }
        return depList.push(versionList)
    });


}


function makeVersionList(versions) {
    var acc = [];
    var value = versions.forEach((variable) => {
        if (!acc.includes(variable.version)) {
            //for each each object in list of the key, do this
            console.log(variable)
            acc.push(variable.version);
        }
    })

    return acc;
}




function semverHelper(data, item, value) {
    return data.forEach(function (item) {
        var existing = output.filter(function (v, i) {
            return v.name == item.name;
        });
        if (existing.length) {
            var existingIndex = output.indexOf(existing[0]);
            output[existingIndex].value = output[existingIndex].value.concat(item.value);
        } else {
            if (typeof item.value == 'string')
                item.value = [item.value];
            output.push(item);
        }
    });

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


function saveRequiredModules(filename = 'solutionCandidates') {
    text = JSON.stringify(REQUIREDPACKAGES);
    fileSystem.appendFile(path.join('./files/', filename, '.txt'), text, function (err) {
        if (err) throw err;
        console.log('Candidate modules have been saved');
        REQUIREDPACKAGES = [];
    });
}




//returns the json from a module based on the name
function getModuleJSON(modulename) {
    let startpath = path.join(__dirname, 'modules');
    var truepath = path.join(startpath, modulename, 'modulemetadata.json');
    return fileSystem.readFileSync(truepath, 'UTF-8', function (err, data) {
        if (err) return console.log(err + "NO SUCH MODULE");
        manifest = JSON.parse(data);
    });
}



//reads the manifest sent by client
function getDeviceDescription() {
    //TODO: change to accept path of manifest
    return fileSystem.readFileSync('./files/devicedescription.json', 'UTF-8', function (err, data) {
        if (err) return console.log(err + " couldn't read the file!");

        manifest = JSON.parse(data);
    });
}



//reads the manifest sent by client
function getManifest() {
    return fileSystem.readFileSync('./files/manifest.json', 'UTF-8', function (err, data) {
        if (err) return console.log(err + " couldn't read the file!");

        manifest = JSON.parse(data);
    });
}


//checks if all required interfaces are offered by module
function matchInterfaces(moduleInterfaces, manifestInterfaces) {
    console.log(" -- offered interfaces from module -- ")
    console.log(moduleInterfaces);
    console.log(" -- interfaces required -- ")
    console.log(manifestInterfaces);
    var fulfilledInterfaces = 0;
    for (var i in manifestInterfaces) {
        if (moduleInterfaces.includes(manifestInterfaces[i])) {
            fulfilledInterfaces++
            console.log(fulfilledInterfaces);
        }
    }
    if (fulfilledInterfaces == manifestInterfaces.length) {
        console.log("--- manifest interfaces satisfied --- ");
        return true;
    }

    else {
        console.log("--- manifest interfaces not satisfied --- ");
        return false;
    }
}




startSearch();



//compares two individual objects for their contents to assert equality (deep equality)
function deepEqual(object1, object2) {
    const keys1 = Object.keys(object1);
    const keys2 = Object.keys(object2);
    if (keys1.length !== keys2.length) {
        return false;
    }
    for (const key of keys1) {
        const val1 = object1[key];
        const val2 = object2[key];
        const areObjects = isObject(val1) && isObject(val2);
        if (
            areObjects && !deepEqual(val1, val2) ||
            !areObjects && val1 !== val2
        ) {
            return false;
        }
    }
    return true;
}

//returns true if input is an object
function isObject(object) {
    return object != null && typeof object === 'object';
}

//return an array of objects according to key, value, or key and value matching
//accepts an object to search, a key to search for, and a value to search for
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


//return an array of keys that match on a certain value
function getKeys(obj, val) {
    var objects = [];
    for (var i in obj) {
        if (!obj.hasOwnProperty(i)) continue;
        if (typeof obj[i] == 'object') {
            objects = objects.concat(getKeys(obj[i], val));
        } else if (obj[i] == val) {
            objects.push(i);
        }
    }
    return objects;
}



//console.log(isSubset(["dht22" , "logitech_123"], ["dht22", "logitech_123", "networking"] ));
//checks if the latter is the subset of the first array
function isSubset(set, subset) {
    if (subset == "") { return false };
    console.log(set);
    console.log(" compared to ");
    console.log(subset);

    for (var i in subset) {
        //console.log(i);
        // console.log(set.includes(subset[i]));
        if (!set.includes(subset[i])) {
            console.log(set + " does not include :" + subset[i]);
            return false;
        }

    }
    return true;


}


