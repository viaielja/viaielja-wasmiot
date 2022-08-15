const { Console } = require('console');
const { create } = require('domain');
const util = require('util');


const semver = require('semver');
const { version } = require('os');
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




//TODO: Array.prototype.group()??
//

//creates a recursive requirement tree
//WARNING: Will loop if there are loops in required modules!!
//TODO: add backtracing to not get stuck in loops with required modules
function start(node){

    let reqs = []
    let h = {
        dependencies: [],
        id: node.id,
        version: node.version //TODO: add semver later
    }

    reqs = node.dependencies;
 
    if(!isEmpty(node.dependencies[0])){
     
        node.dependencies.forEach((req) => {
            if(Object.keys(req)[0] == undefined){
                return {};} 
                if(getValues(tree,'id').includes(Object.keys(req)[0])){
                    var position = Object.keys(tree).indexOf(Object.keys(req)[0]);
                    
                    tree.push({id :h.id,version : h.version});    
                    
                return h;
            };


                var dependencyWithVersion = 
                {
                   id : Object.keys(req)[0],
                   version: getValues(req, "version")[0]
                }

               tree.push(dependencyWithVersion);
               tree.push({id :h.id,version : h.version});
               
            h.dependencies.push(start(
                JSON.parse(getModuleByName(
            Object.keys(req)[0])), tree))
         })
    
    return h;
 }


 h = {
         id: node.id
     }
 return h;
}



function getTree(node){

    let reqs = []
    let h = {
        dependencies: [],
        id: node.id,
        version: node.version //TODO: add semver later
    }

    reqs = node.dependencies;
 
    if(!isEmpty(node.dependencies[0])){
     
        node.dependencies.forEach((req) => {
            if(Object.keys(req)[0] == undefined){
                return {};} 
                if(getValues(tree,'id').includes(Object.keys(req)[0])){
                    var position = Object.keys(tree).indexOf(Object.keys(req)[0]);
                    
                    tree.push({id :h.id,version : h.version});    
                    
                return h;
            };


                var dependencyWithVersion = 
                {
                   id : Object.keys(req)[0],
                   version: getValues(req, "version")[0]
                }

               tree.push(dependencyWithVersion);
               tree.push({id :h.id,version : h.version});
               
            h.dependencies.push(start(
                JSON.parse(getModuleByName(
            Object.keys(req)[0])), tree))
         })
    
    return tree;
 }


 h = {
         id: node.id
     }
 return h;
}




  var groupBy = function(xs, key) {
    return xs.reduce(function(rv, x) {
      (rv[x[key]] = rv[x[key]] || []).push(x);
      return rv;
    }, {});
  };
  

  
  // => {3: ["one", "two"], 5: ["three"]}

function makeSemver(tree){
    semverArray = 
    {};
    tree.forEach((dep) => {
        
    })

    return [];
};

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

function isEmpty(obj) {
    for(var prop in obj) {
      if(Object.prototype.hasOwnProperty.call(obj, prop)) {
        return false;
      }
    }
  
    return JSON.stringify(obj) === JSON.stringify({});
  }







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

exports.start = start;
exports.groupBy = groupBy;
exports.getTree = getTree;