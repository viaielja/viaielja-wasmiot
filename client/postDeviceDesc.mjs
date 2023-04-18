// Require-importing failed and suggested to use this syntax (some
// EcmaScript-issue).
import fetch from 'node-fetch' //used for 
// Import failed so used this ->
// https://stackoverflow.com/questions/70106880/err-import-assertion-type-missing-for-import-of-json-file
import manifest from './devicedescription.json' assert { type:  "json" } //hard-coded json file with manifest of required functionality



/*
* NOTE: THIS IS OUTDATED REGARDING THE __ORCHESTRATOR__!!
* sends a fetch POST request to a server containing manifest in the body
*/
(async function postFile() {
    const rawResponse = await fetch('http://localhost:3000/file/device', {
        method: 'POST',
        headers: {
      'Content-Type': 'application/json'
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