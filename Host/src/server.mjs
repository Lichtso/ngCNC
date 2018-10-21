const gamepad = require("gamepad");


const fs = require('fs'),
      path = require('path'),
      http2 = require('http2'),
      hostingRoot = '../UserInterface',
      hostingDefault = 'main.html',
      contentTypeByExtension = {
    '.txt': 'text/plain',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.html': 'text/html',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpg'
};


function createServer() {
// https://devcenter.heroku.com/articles/ssl-certificate-self
const server = http2.createSecureServer({
    'key': fs.readFileSync('localhost.key'),
    'cert': fs.readFileSync('localhost.crt')
});

server.on('stream', (stream, headers) => {
    console.log('stream', headers);
    function sendErrorMessage(code) {
        stream.respond({':status': code});
        stream.end('ERROR: '+code);
    }
    switch(headers[':method']) {
        case 'GET': {
            const filePath = (headers[':path'] == '/') ? hostingRoot+'/'+hostingDefault : hostingRoot+headers[':path'];
            fs.open(filePath, 'r', (error, fd) => {
                if(error)
                    sendErrorMessage((error.code == 'ENOENT') ? 404 : 500);
                else {
                    const stat = fs.fstatSync(fd);
                    stream.respondWithFD(fd, {
                        'last-modified': stat.mtime.toUTCString(),
                        'content-length': stat.size,
                        'content-type': contentTypeByExtension[path.extname(filePath)]
                    });
                    stream.end();
                }
            });
        } break;
    }
});
server.listen(443);
return server;
}

gamepad.init()

// List the state of all currently attached devices
for (let i = 0, l = gamepad.numDevices(); i < l; i++) {
  console.log(i, gamepad.deviceAtIndex());
}

// Create a game loop and poll for events
setInterval(gamepad.processEvents, 16);
// Scan for new gamepads as a slower rate
setInterval(gamepad.detectDevices, 500);

// Listen for move events on all gamepads
gamepad.on("move", function (id, axis, value) {
  console.log("move", {
    id: id,
    axis: axis,
    value: value,
  });
});


