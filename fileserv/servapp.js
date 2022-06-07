var http = require('http'),
    fileSystem = require('fs'),
    path = require('path');
const { findSourceMap } = require('module');
var modulemetadata = require("./files/modulemetadata.json");


http.createServer(function (request, response) {
    if (request.method === "POST") //if client is sending a POST request, log sent data
    {
        let data = '';
        console.log('received POST');



        request.on('data', chunk => {
            data += chunk;
        });
        request.on('end', () => {

            //save sent json content of manifest to a json file
            fileSystem.writeFile('./files/manifest.json', data, function (err) {
                if (err) return console.log(err);
                console.log('data written to file manifest.json');
            });


            response.end(digestManifest(JSON.parse(data)));
        });


    }

    if (request.method === "GET" && request.url === "/") {
        console.log("received GET");
        var filePath = path.join(__dirname, 'files/simple.wasm'); //hardcoded filepath to served file
        //TODO: serve different files based on request
        var stat = fileSystem.statSync(filePath);

        response.writeHead(200, {
            'Content-Type': 'application/wasm',
            'Content-Length': stat.size
        });

        var readStream = fileSystem.createReadStream(filePath);
        readStream.on('data', function (data) {
            var flushed = response.write(data);
            // pause the stream when there's already data there
            if (!flushed)
                readStream.pause();
        });

        response.on('drain', function () {
            // Resume the read stream when the write stream is empty
            readStream.resume();
        });

        readStream.on('end', function () {
            response.end();
        });
    }
    else if (request.method === 'GET') {
        var filePath = path.join(__dirname, request.url);
        console.log(filePath);

        var stat = fileSystem.statSync(filePath);

        if (filePath.endsWith('ico')) { var contenttype = 'image/x-image' }
        else { contenttype = 'text/html' }
        response.writeHead(200, {
            'Content-Type': contenttype,
            'Content-Length': stat.size
        });
        var readStream = fileSystem.createReadStream(filePath);
        readStream.on('data', function (data) {
            var flushed = response.write(data);
            // pause the stream when there's already data there
            if (!flushed)
                readStream.pause();
        });

        response.on('drain', function () {
            // Resume the read stream when the write stream is empty
            readStream.resume();
        });

        readStream.on('end', function () {
            response.end(console.log('ended readstream, listening'));
        });


    }

})
    .listen(3000);










//
function digestManifest(manifest) {
    if (getObjects(manifest, 'roles', '') != []) {
        console.log("this is a device deployment manifest");
        var manifestRoles = getObjects(manifest, 'interface', '');
        var interfaces = getValues(manifestRoles, 'interface');
        var moduleInterfaces = modulemetadata.interfaces;
        matchInterfaces(moduleInterfaces, interfaces);
    }

    else { console.log("this is something else"); }
}


/* function digestModuleMetadata(modulemetadata){
     if (getObjects(modulemetadata, 'id', '') != [] ){
         var interfaces = modulemetadata.interfaces;
         matchInterfaces(interfaces, manifest);
     
     }
 }
*/

//checks if all required interfaces are offered by module
function matchInterfaces(moduleInterfaces, manifestInterfaces) {
    console.log(" -- offered interfaces from module -- ")
    console.log(moduleInterfaces);
    console.log(" -- interfaces required -- ")
    console.log(manifestInterfaces);
    for (var i in manifestInterfaces) {
        if (moduleInterfaces.includes(manifestInterfaces[i])) {
            //check if all modules match
        }
    }

}


/*    //separates each role into its own
function separateRoles(manifest, interfaces) {
    var roleObjects = [];
    for (var interface in interfaces){
    var name = "temperature_logging";
    }
    return roleObjects;
}
*/

//returns interfaces from the roles
function getInterfaces(roles) {
    return Object.keys(roles);
}



function matchRoles(clientManifest, modulemetadata) {
    var clientRoles = getRoles(clientManifest),
        serverRoles = getRoles(modulemetadata);

    if (deepEqual(clientRoles, serverRoles)) {
        console.log(serverRoles);
    }
    else console.log("no match found");

};

function getRoles(manifest) {
    console.log('---- searching for roles ----')
    roles = [];
    for (var i in manifest.roles) {
        roles.push(manifest.roles[i]);
        console.log(roles[i]);
    }

    return roles;
}




//compares two individual objects for their contents to assert equality
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


function isObject(object) {
    return object != null && typeof object === 'object';
}


//finds a matching keyword from json and prints the key + value
function readManifest(manifest) {
    //
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


//Looks for matching key: value pairs between stored solutions and manifest
function lookUpKey(key, value) {
    //TODO: Look up keys in a local file to find suitable packages for solution
    for (var candidate in modulemetadata) {
        if (modulemetadata.hasOwnProperty(key)) {

            console.log("found " + key + " with : " + value);
        }

    }


}



