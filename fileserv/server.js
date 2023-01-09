var express = require("express");

var fileSystem = require('fs'),
    path = require('path');

const { chdir } = require('process');


// Set working directory to this file's root in order to use relative paths
// (i.e. "./foo/bar"). TODO Find out if the problem is with incompatible Node
// versions (16 vs 18).
chdir(__dirname);

var app = express();

app.get("/", (request, response) => {
    console.log("received GET");
    var filePath = path.join(__dirname, 'files/simple.wasm'); //hardcoded filepath to served file

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
});

app.get("/foo", (request, response) => {
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
})

app.post("/", (request, response) => {
    let data = '';
    console.log('received POST');
    request.on('data', chunk => {
        data += chunk;
    });

    request.on('end', () => {
        if (Object.keys(JSON.parse(data)).includes('architecture')) { // Handle Device Descriptions
            console.log(' --- this is a device description --- ');
            fileSystem.writeFile('./files/devicedescription.json', data, function (err) {
                if (err) return console.log(err);
                console.log('--- data written to file devicedescription.json ---');
                response.end();
            });
        }
        //save sent json content of manifest to a json file
        else fileSystem.writeFile('./files/manifest.json', data, function (err) { // Handle Manifest files
            if (err) return console.log(err);
            console.log('data written to file manifest.json');
            response.end(startSearch()); //TODO: Start searching for suitable packages using saved file
        });
        response.end();
    });
});

const port = 3000;
app.listen(port, () => {
    console.log(`Listening on port: ${port}`);
});