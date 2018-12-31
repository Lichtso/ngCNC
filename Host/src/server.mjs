const gamepad = require('gamepad'),
      fs = require('fs'),
      {extname, join, resolve} = require('path'),
      {createSecureServer} = require('http2');

function loadConfig(dir = join(__dirname, '..', 'config')) {
    let config = {
        'http': {
            'port': 8443,
            'key': 'key.pem',
            'cert': 'cert.pem'
        }
    }
    const path = join(dir, 'config.json');
    try {
        function merge(a, b) {
            switch(typeof b) {
                case 'string':
                case 'number':
                    return b;
                case 'object':
                    Object.keys(b).forEach(k => {
                        a[k] = merge(a[k], b[k]);
                    });
            }
            return a;
        }
        config = merge(config, JSON.parse(fs.readFileSync(path, {'encoding': 'utf8'})));
    } catch(e) { }
    fs.writeFileSync(path, JSON.stringify(config, undefined, 4), {'encoding': 'utf8'});
    try {
        config.http.key = fs.readFileSync(resolve(dir, config.http.key));
        config.http.cert = fs.readFileSync(resolve(dir, config.http.cert));
    } catch(e) {

    }
    return config;
}
const config = loadConfig(),
      staticContentRoot = join(__dirname, '..', '..', 'UserInterface'),
      server = createSecureServer(config.http),
      sockets = new Map(),
      contentTypeByExtension = {
    '.txt': 'text/plain',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.html': 'text/html',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpg'
};
server.on('stream', (stream, headers) => {
    console.log('stream', headers);
    function sendErrorMessage(code) {
        stream.respond({':status': code});
        stream.end('Error: '+code);
    }
    let filePath;
    if(headers[':path'].startsWith('/node_modules/'))
        filePath = join(join(__dirname, '..'), headers[':path']);
    else if(headers[':path'].startsWith('/socket/')) {
        const socket = sockets.get(headers[':path'].substr(1));
        stream.on('data', (data) => {
            if(socket.ondata)
                socket.ondata(data);
            stream.respond({':status': 200});
            stream.end();
        });
        return;
    } else switch(headers[':path']) {
        case '/socket':
            stream.name = `${stream.session.socket.remoteAddress}:stream.session.socket.remotePort/socket/${stream.id}`;
            stream.on('close', () => {
                if(stream.onclose)
                    stream.onclose();
                sockets.delete(stream.name);
            });
            stream.respond({':status': 200, 'content-type': 'text/event-stream', 'Cache-Control': 'no-cache'});
            stream.write(`event: uplink\ndata: ${stream.name}\n\n`);
            sockets.set(stream.name, stream);
            return;
        case '/':
            filePath = join(staticContentRoot, 'index.html');
            break;
        default:
            filePath = join(staticContentRoot, headers[':path']);
            break;
    }
    fs.open(filePath, 'r', (error, fd) => {
        if(error)
            sendErrorMessage((error.code == 'ENOENT') ? 404 : 500);
        else {
            const stat = fs.fstatSync(fd);
            stream.respondWithFD(fd, {
                'last-modified': stat.mtime.toUTCString(),
                'content-length': stat.size,
                'content-type': contentTypeByExtension[extname(filePath)]
            });
            stream.end();
        }
    });
});
server.listen(config.http.port);



gamepad.init();
for(let i = 0, l = gamepad.numDevices(); i < l; i++)
    console.log(i, gamepad.deviceAtIndex());
setInterval(gamepad.processEvents, 16);
setInterval(gamepad.detectDevices, 1000);
gamepad.on('move', (id, axis, value) => {
    console.log('move', {id, axis, value});
});
