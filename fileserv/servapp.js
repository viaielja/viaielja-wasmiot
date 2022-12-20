const { Console, groupCollapsed } = require('console');
const { chdir } = require('process');

var http = require('http'),
    fileSystem = require('fs'),
    path = require('path'),
    dependencytree = require('./dependencytree.js'),
    semver = require('semver');
    
    chdir(__dirname);

const { findSourceMap } = require('module');
var REQUIREDPACKAGES = [];
var DEVICEMANIFEST;
var DEVICEDESCRIPTION;


const getDirectories = srcPath => fileSystem.readdirSync(srcPath).filter(file => fileSystem.statSync(path.join(srcPath, file)).isDirectory());

//searches the server for modules that satisfy device description and manifest
function startSearch() {
    //TODO: Start searching for suitable packages using saved file

    var listOfModules = getDirectories("./modules"); //get name of the directories of every module
    var deviceManifest = JSON.parse(getManifest());  //get device manifest as JSON
    var roles = deviceManifest.roles; //get roles from manifest
    console.log(getManifest());


 

    // for each role in the manifest, get the specific modules for requested interfaces
    for (var i in roles) {
        //check if interface matches
   
        var requiredDeviceInterface = roles[i].role_config.interface
        var requiredModule = findModuleForDeviceInterface(requiredDeviceInterface, listOfModules);
        console.log("Added module -> "  +  requiredModule.id + " with version :  " +  requiredModule.version   + "  to list of required packages");
        REQUIREDPACKAGES.push({id : requiredModule.id,version : requiredModule.version, role : i});
       
   
         //TODO: ACTION AFTER FINDING MODULES
    }
    console.log ("Here are the required packages ");
    console.log(REQUIREDPACKAGES);
    
    /*for (const [key, value] of Object.entries(deviceManifest.roles)){
    
        console.log(roles)
    }
    /*testModule = JSON.parse(getModuleWithVersion("dht22_logger", "1.0.2"));
    console.log(testModule);
    /*dependencyList = dependencytree.makeTree(testModule);
    console.log(dependencyList);
    /*groupedList = dependencytree.groupBy(dependencytree.getTree(testModule), 'id')
    console.log(groupedList);
    
    return dependencyList;*/
}



function findModuleForDeviceInterface(requiredDeviceInterface, listOfModules)
{   
   
    while (!checkInterfaces(requiredDeviceInterface, listOfModules)) { console.log("Interface not found") }
    console.log("Interface found!" + checkInterfaces(requiredDeviceInterface, listOfModules));
    return checkInterfaces(requiredDeviceInterface, listOfModules);

}


//check if a module fills an interface required in the manifest
let checkInterfaces = (requiredDeviceInterface, listOfModules) => {

    for (let i = 0; i < requiredDeviceInterface.length; i++) {
        
    
        for (let j = 0; j < listOfModules.length; j++) {
            var moduleInterfaces = getModuleInterfaces(JSON.parse(getModuleJSON(listOfModules[j], "1.0.0")));
            console.log(JSON.parse(getModuleJSON(listOfModules[j], "1.0.0")))
            console.log(moduleInterfaces);
            console.log(requiredDeviceInterface)

            if (moduleInterfaces.includes(requiredDeviceInterface)) {
                console.log("module -> "  + JSON.parse(getModuleJSON(listOfModules[j], "1.0.0")).id + "  contains  " + requiredDeviceInterface )
                return JSON.parse(getModuleJSON(listOfModules[j], "1.0.0"));
            }
        }

}
    return false;
}






//check if module can be ran on a specific device by comparing module metadata and device description
let checkArchPlatformPeripherals = (moduleMetadata, deviceDescription) => {
    let arch = moduleMetadata.architecture;
    let platform = moduleMetadata.platform;
    let peripherals =moduleMetadata.peripherals;

    if (deviceDescription.architecture === arch &&
        deviceDescription.platform === platform &&
        deviceDescription.peripherals.some(item => peripherals.includes(item))
    ) {
        return true;
    }
    return false;
}


//handle manifest and matching of interfaces
function digestManifest(manifest, moduleMetadata) {
    if (getObjects(manifest, 'roles', '') != []) {
        console.log("this is a device deployment manifest");
        var manifestRoles = getManifestRoles(manifest);
        var interfaces = getValues(manifestRoles, 'interface');
        var moduleInterfaces = getModuleInterfaces(moduleMetadata);

        //save candidate name with interfaces for later
        if (matchInterfaces(moduleInterfaces, interfaces)) {

            console.log("found requested interfaces in module")
            fileSystem.appendFile('./files/solutionCandidates.txt', JSON.stringify(moduleMetadata.id) + ' : ' + moduleInterfaces, function (err) {
                if (err) throw err;
                console.log('Candidate module has been saved');
            });
        }
        else return;
    }

    else { console.log("this is something else"); }
}

function getModuleInterfaces(moduleMetadata) {
    return moduleMetadata.interfaces;
}

function getManifestRoles(manifest) {
    return getObjects(manifest, 'interface', '');
}


data = {
    networking: [
        { id: 'networking', version: '1.0.0' },
        { id: 'networking', version: '1.0.0' }
    ],
    dht22_logger: [
        { id: 'dht22_logger', version: '1.0.0' },
        { id: 'dht22_logger', version: '1.0.0' },
        { id: 'dht22_logger', version: '1.0.0' },
        { id: 'dht22_logger', version: '1.0.0' },
        { id: 'dht22_logger', version: '1.0.0' },
        { id: 'dht22_logger', version: '1.0.0' }
    ],
    supplement: [
        { id: 'supplement', version: '1.0.0' },
        { id: 'supplement', version: '1.0.0' }
    ],
    test_module: [
        { id: 'test_module', version: '1.0.0' },
        { id: 'test_module', version: '1.0.0' }
    ]
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


//makeSemverDepList(data);

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





//returns module by its name and version from local module library
function getModuleWithVersion(modulename, version) {

    //returns the json from a module based on the name
    function getModuleJSON(modulename, version) {
        if (!modulename) { return null }
        if (!version) { console.log("No such version, defaulting to 1.0.0 " + modulename + version); return getModuleWithVersion(modulename, "1.0.0") };
        let startpath = path.join(__dirname, 'modules');
        let fixedVersion = modulename + "-" + version;
        var truepath = path.join(startpath, modulename, fixedVersion, 'modulemetadata.json');
        return fileSystem.readFileSync(truepath, 'UTF-8', function (err, data) {
            if (err) return console.log(err + "NO SUCH MODULE");
            manifest = JSON.parse(data);
        });
    }
    //console.log("NAME OF FETCHED MODULE:   ");
    //console.log(modulename);


    return getModuleJSON(modulename, version);

}


function checkIndividualModule(deviceManifest, deviceDescription, modulename) {
    //TODO: handle superdependencies of modules
    //TODO: handle loops in superdepency
    //TODO: find most satisfying group of candidates 
    var module = JSON.parse(getModuleJSON(modulename));
    deviceDescription = JSON.parse(deviceDescription);
    deviceManifest = JSON.parse(deviceManifest);
    checkArchitecture(deviceDescription, module);
    checkPeripherals(deviceDescription, module);
    checkInterfaces(deviceManifest, module);
    //TODO: create a dependency tree
    addToCandidateList(module);





}


//returns an object containing dependencies of a module (superdependencies)
function getModuleDependencies(moduleMetadata) {
    var dependencies = moduleMetadata.dependencies;
    if (dependencies === undefined) {
        console.log("--- no dependencies found ---")
        return undefined;
    }
    console.log(" --- dependencies of module --- ");
    console.log(Object.keys(dependencies));
    return dependencies;
}


function saveRequiredModules() {
    text = JSON.stringify(REQUIREDPACKAGES);
    fileSystem.appendFile('./files/solutionCandidates.txt', text, function (err) {
        if (err) throw err;
        console.log('Candidate modules have been saved');
        REQUIREDPACKAGES = [];
    });
}

//adds a module to the list of required modules
function addToCandidateList(module) {
    text = module.id + ' : ' + getModuleInterfaces(module);
    REQUIREDPACKAGES.push(text);

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


//checks whether peripherals in device description and  module metadata match
function checkPeripherals(deviceDescription, module) {
    if (isSubset(deviceDescription.peripherals, module.peripherals)) {
        console.log("Module peripherals match!");
        return true;
    }
    else { console.log("module peripherals do not match"); return false; }
}

//checks Architecture and platform supported by module
function checkArchitecture(deviceDescription, module) {
    if (deviceDescription.architecture === module.architecture
        && deviceDescription.platform
        === module.platform) {
        console.log("architecture and platform matches!");
        return true;
    }
    return false;
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

//returns interfaces from the roles
function getInterfaces(deviceManifest) {
    return getValues(deviceManifest.roles, "interface");
}

function matchRoles(clientManifest, modulemetadata) {
    var clientRoles = getRoles(clientManifest),
        serverRoles = getRoles(modulemetadata);

    if (deepEqual(clientRoles, serverRoles)) {
        console.log(serverRoles);
    }
    else console.log("no match found");

};


//returns list of roles
function getRoles(manifest) {
    console.log('---- searching for roles ----')
    roles = [];
    //TODO: .ever would work better here
    for (var i in manifest.roles) {
        roles.push(manifest.roles[i]);
        console.log(roles[i]);
    }

    return roles;
}



startSearch();

/*
//get metadata of a module in a folder
function getModulemetadata(dirPaths) {
    let startpath = path.join(__dirname, 'modules');
    for (var i in dirPaths) {

        console.log(dirPaths[i]);
        var moduleMetadata;
        var truepath = path.join(startpath, dirPaths[i], 'modulemetadata.json');
        //console.log(truepath);

        //move to separate function for general use
        var moduleMetadata = fileSystem.readFile(truepath, 'utf8', function (err, data) {
            let metadata = data;
            checkModule(JSON.parse(data));

        });

    }

    //handels device description sent by device
    function digestDeviceDescription(manifest, modulemetadata) {
        // console.log(modulemetadata);
        var deviceDescription;
        var moduleMetadata;
        deviceDescription = fileSystem.readFile('./files/devicedescription.json', 'UTF-8', function (err, data) {
            if (err) return console.log(err);

            console.log('---- file has been read ----')
            deviceDescription = JSON.parse(data);
            moduleMetadata = modulemetadata;

        });
    }

}
*/

//TODO: move stuff below to separate utility file

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
//checks if one set is subset of another
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


function getDirectories2(srcPath) {
    return fileSystem.readdirSync(srcPath).filter(
        file => fileSystem.statSync(path.join(srcPath, file)).isDirectory());
}

//console.log(makeSemverDepList(data));


function reducer(dependency, version) {
    if (!dependency[version]) {
        dependency.push(version);
    }
    else return null;

}

