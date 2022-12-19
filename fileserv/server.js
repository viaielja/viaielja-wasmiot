var http = require('http'),
    fileSystem = require('fs'),
    path = require('path');

const { chdir } = require('process');

chdir(__dirname);



http.createServer(function (request, response) {
    if (request.method === "POST") //if client is sending a POST request, log sent data
    {
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
    }

    if (request.method === "GET" && request.url === "/") {
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

}).listen(3000);
