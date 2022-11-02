const { Console } = require('console');
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


var testModule = JSON.parse(getModuleWithVersion("dht22_logger", "1.0.2"));

var testList = [];
//makeTree(testModule);
/*console.log(testList)
groupList = groupBy(testList, "id")
console.log(groupList)
*/
console.log(testList)


function checkMatches(list, req){
    var matches = [];
            for (var i in list) {
         

                if (list[i].id == Object.keys(req)){
                    matches.push(list[i].version)
                }
                }
                return matches;
};





//
// Creates a list of modules dependencies. If the module is in the list but the version differs, creates a new item in the list
//
//
function makeTree(node){
    var list = [];
    let reqs = node.dependencies;
  

    let h = {
        id: node.id,
        version: node.version //TODO: add semver later
    }
    testList.push(h);
    if(!isEmpty(node.dependencies[0])){
    for (var i in reqs){



    if(getValues(testList, "id").includes(Object.keys(reqs[i])[0]) ){  
        //add check for version 
        let j = {
            id: Object.keys(reqs[i])[0],
            version: getValues(reqs[i], "version")[0]
        }
    

    var listToSearch = getObjects(testList, "id", Object.keys(reqs[i])[0]);
  

        
    if(!getValues(listToSearch, "version").includes(j.version)){
       // console.log(listToSearch[0].version == j.version );
        //makeTree with current module and version!!
        makeTree(JSON.parse(getModuleWithVersion(Object.keys(reqs[i])[0], getValues(reqs[i], "version")[0])))

    }
    
          
        }

    

    if(!getValues(testList, "id").includes(Object.keys(reqs[i])[0]) && !getValues(testList, "version").includes(reqs[i].version)){
    //console.log(getValues(reqs[i], "version")[0])
    //console.log(getModuleWithVersion(Object.keys(reqs[i])[0], getValues(reqs[i], "version")[0]));   
    
        makeTree(JSON.parse(getModuleWithVersion(Object.keys(reqs[i])[0], getValues(reqs[i], "version")[0])))
    }}}
return testList;
}


function getTree(node){

    let reqs = []
    let h = {
        dependencies: [],
        id: node.id,
        version: node.version 
    }

    
    reqs = node.dependencies;
 
    if(!isEmpty(node.dependencies[0])){
     
        node.dependencies.forEach((req) => {

            var dependencyWithVersion = 
            {
               id : Object.keys(req)[0],
               version: getValues(req, "version")[0]
            }

            if(Object.keys(req)[0] == undefined){
                return {};} 
                console.log(req)
                console.log(getValues(req, "version"));
                if(getValues(tree,'id').includes(Object.keys(req)[0]) && !getValues(tree,'version').includes(Object.keys(req)[0].version)){
                   

                    var position = Object.keys(tree).indexOf(Object.keys(req)[0]);
                    
                    
                    tree.push(dependencyWithVersion);
                    tree.push({id :h.id,version : h.version});  
                  
                return tree;
            };

            if(getValues(tree,'id').includes(Object.keys(req)[0]) && getValues(tree,'version').includes(Object.keys(req)[0].version)){
                console.log("AAAAAAAAAAAAAAAA");
            return tree;
            
            }


               

                tree.push(dependencyWithVersion);
                tree.push({id :h.id,version : h.version});
              
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

//Returns true if object is empty 
function isEmpty(obj) {
    for(var prop in obj) {
      if(Object.prototype.hasOwnProperty.call(obj, prop)) {
        return false;
      }
    }
  
    return JSON.stringify(obj) === JSON.stringify({});
  }





//returns module by its name and version from local module library
function getModuleWithVersion(modulename, version){

    //returns the json from a module based on the name
    function getModuleJSON(modulename, version) {
        if(!modulename || !version) {console.log("No such version " + modulename +  version ); return getModuleByName(modulename)};
        let startpath = path.join(__dirname, 'modules');
        let fixedVersion = modulename + "-" + version;
        var truepath = path.join(startpath, modulename,fixedVersion, 'modulemetadata.json');
        return fileSystem.readFileSync(truepath, 'UTF-8', function (err, data) {
            if (err) return console.log(err + "NO SUCH MODULE");
            manifest = JSON.parse(data);
        });
    }
    //console.log("NAME OF FETCHED MODULE:   ");
    //console.log(modulename);
    
    
    return getModuleJSON(modulename, version);
    
}



//returns module by its name from local module library
//@return module with matching name as json object
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


//creates a recursive requirement tree
//WARNING: Will loop if there are loops in required modules!!
//TODO: add backtracing to not get stuck in loops with required modules
function start(node){

    let reqs = [];
    let h = {
        dependencies: [],
        id: node.id,
        version: node.version //TODO: add semver later
    }

    reqs = node.dependencies;
 
    if(!isEmpty(node.dependencies[0])){
     
        node.dependencies.forEach((req) => {
            if(Object.keys(req)[0] == undefined){return {};} 

                var matches = checkMatches(tree, req);
                console.log(matches);
                console.log(getValues(req, 'version'));
                
                if(getValues(tree,'id').includes(Object.keys(req)[0]) && !matches.includes(getValues(req, 'version'))  ){
                    var position = getValues(tree,'id').indexOf(Object.keys(req)[0]);
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
                JSON.parse(getModuleWithVersion(
                    Object.keys(req)[0], getValues(req, "version")[0]))))
                 })
    
    return h;
 }


 h = {
         id: node.id
     }
 return h;
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
exports.getTree = getTree;
exports.makeTree = makeTree;