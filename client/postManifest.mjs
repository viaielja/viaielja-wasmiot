import fetch from 'node-fetch'
import manifest from './deploymentmanifest.json' assert { type:  "json" }


/*
sends a fetch POST request to a server containing manifest in the body
*/
(async function postFile() {
    const rawResponse = await fetch('http://localhost:3000/file/manifest', {
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