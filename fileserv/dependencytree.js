const { Console } = require('console');
const { create } = require('domain');
const util = require('util');


const semver = require('semver');



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
                    }],
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
                //console.log("no deps");
                return {};} 
            // const reqPath = path.resolve(parent, req.value)
            console.log(h);
            h.dependencies.push(start(
                JSON.parse(getModuleByName(
                    Object.keys(req)[0])), tree))
         })
         //l(h)
     return h
 }
 h = {
         ID: node.id,
     }
     //l(h)
 return h
}

start(modules[1], {})



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





