const gamepad = require('gamepad'),
      fs = require('fs'),
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


// https://devcenter.heroku.com/articles/ssl-certificate-self
const sockets = new Map(),
      server = http2.createSecureServer({
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
        case 'DOWN': {
            stream.name = stream.session.socket.remoteAddress+':'+stream.session.socket.remotePort+'/'+stream.id;
            stream.on('close', () => {
                if(stream.onclose)
                    stream.onclose();
                sockets.delete(stream.name);
            });
            stream.respond({':status': 200});
            stream.write(stream.name);
            sockets.set(stream.name, stream);
        } break;
        case 'UP': {
            const socket = sockets.get(headers[':path'].substr(1));
            stream.on('data', (data) => {
                if(socket.ondata)
                    socket.ondata(data);
                stream.respond({':status': 200});
                stream.end();
            });
        } break;
    }
});
server.listen(443);


gamepad.init();
for(let i = 0, l = gamepad.numDevices(); i < l; i++)
    console.log(i, gamepad.deviceAtIndex());

setInterval(gamepad.processEvents, 16);
setInterval(gamepad.detectDevices, 1000);

gamepad.on('move', function(id, axis, value) {
    console.log('move', {
        'id': id,
        'axis': axis,
        'value': value,
    });
});
