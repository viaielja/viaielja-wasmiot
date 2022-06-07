const fetch = require('node-fetch'); //used for 
const manifest = require('./deploymentmanifest.json'); //hard-coded json file with manifest of required functionality
const fs = require('fs');



/*
sends a fetch POST request to a server containing manifest in the body
*/
(async function postFile() {
    const rawResponse = await fetch('http://localhost:3000/.', {
        method: 'POST',
        headers: {
      'Content-Type': 'text/html'
        },
        body: JSON.stringify(manifest)
      }).then(data => console.log(data)); //log the response sent by the server

  })();
/*
 //sends a fetch GET request to a server for a specific file
 async function fetchFile(){
  console.log('fetching files');
  const response = await fetch('http://localhost:2000/.');
  const fileStream = fs.createWriteStream("./files/received.wasm");
  response.body.pipe(fileStream);
 // response.body.on("error", reject);
 //const data = await response.json();
 //fileStream.on("finish", resolve);
 // console.log(data);
  }

  
//fetchFile();*/