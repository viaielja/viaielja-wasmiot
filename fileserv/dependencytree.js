const { Console } = require('console');
const { create } = require('domain');
const util = require('util');


const semver = require('semver');
const { version } = require('os');



path = require('path');
fileSystem = require('fs');
//modules for testing
var modules = 
 [{
    "id": "dht22_logger",                           
    "architecture": "aarch64", 
    "platform": "linux", 
    "interfaces": ["humidity_sensor", "temperature_sensor"],  
    "dependencies": [{ 
        "networking": { 
            "version": "1.0.0" 
            }},
            {"supplement": { 
                "version": "1.0.0" 
                  }
                },
            {"test_module": { 
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
    "peripherals": [] ,
    "dependencies": [{
       "supplement": { 
          "version": "1.0.0" 
            }}
        ]
},
{ 
    "id": "supplement",                           
    "architecture": "aarch64", 
    "platform": "linux", 
    "interfaces": ["networking"],  
    "peripherals": [] ,
    "dependencies": [{ 
        "networking": { 
            "version": "1.0.0" 
              }
    }]
}
];

function startTree(node, tree){
    return start(node, tree)
}




//creates a recursive requirement tree
//WARNING: Will loop if there are loops in required modules!!
//TODO: add backtracing to not get stuck in loops with required modules
function start(node, tree){

    let reqs = []
    let h = {
        dependencies: [],
        ID: node.id,
        version: node.version //TODO: add semver later
    }

    reqs = node.dependencies;
 
    if(node.dependencies){
     
        node.dependencies.forEach((req) => {
            if(Object.keys(req)[0] == undefined){
                return {};} 
                if(tree.includes(Object.keys(req)[0])){console.log("ALREADY IN :  " + Object.keys(req)[0]);
                return h;
            };


                var dependencyWithVersion = 
                {
                   name: Object.keys(req)[0],
                   version: getValues(req, "version")[0]
                }
       
               tree.push(dependencyWithVersion);
               tree.push(h.ID);
               
            h.dependencies.push(start(
                JSON.parse(getModuleByName(
Object.keys(req)[0])), tree))
         })

     return h;
 }
 h = {
         ID: node.id
     }
     //l(h)
 return h
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

testModule = JSON.parse(getModuleByName("dht22_logger"));



console.log(start(testModule,[]));

//returns module by its name from local module library
function getModuleByName(modulename){

    //returns the json from a module based on the name
    function getModuleJSON(modulename) {
        let startpath = path.join(__dirname, 'modules');
    
        var truepath = path.join(startpath, modulename, 'modulemetadata.json');
        return fileSystem.readFileSync(truepath, 'UTF-8', function (err, data) {
            if (err) return console.log(err + "NO SUCH MODULE");
            manifest = JSON.parse(data);
        });
    }
    //console.log("NAME OF FETCHED MODULE:   ");
    //console.log(modulename);
    
    
    return getModuleJSON(modulename);
    
}

//checks a tree for if a package has already been required before
function checkTreeForMatches(tree, dependency){
//TODO: add code

console.log(dependency);
console.log(JSON.stringify(tree, null, 2));
//console.log(Object.keys(dependency)[0]);
//console.log(tree);
//searchTree(tree, Object.keys(dependency)[0]);
//console.log(getKeys(tree, Object.keys(dependency)[0]));

if (true){console.log("");
};

//TODO: SEMVER!!
}



//searches a tree recursively for an object matching the keyword
function searchTree(element, matchingTitle){
    console.log(element);
    console.log( matchingTitle)
    if(element.ID == matchingTitle){
         return element;
    }else if (element.ID != null){
         var i;
         var result = null;
         for(i=0; result == null && i < element.dependencies.length; i++){
              result = searchTree(element.dependencies[i], matchingTitle);
         }
         return result;
    }
    return null;
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