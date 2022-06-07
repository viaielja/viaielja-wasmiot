const fetch = require('node-fetch');
const fs = require('fs');
const addr = 'http://localhost:2000/.'
 
 //sends a fetch GET request to a server for a specific file
 async function fetchFile(address){
    if(!addr) {return }
    console.log('fetching files');
    const response = await fetch(address);
    const fileStream = fs.createWriteStream("./files/received.wasm");
    response.body.pipe(fileStream);
    //response.body.on("error", reject);
   // const data = await response.json();
   // fileStream.on("finish", resolve);
    //console.log(data);
    }
    
   fetchFile(addr);