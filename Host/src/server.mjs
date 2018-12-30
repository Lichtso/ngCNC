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
    ['http.key', 'http.cert'].forEach(p => {
        const all = p.split(/\./),
              last = all.pop();
        let cur = config;
        for(const k of all)
            cur = cur[k];
        cur[last] = fs.readFileSync(resolve(dir, cur[last]));
    });
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
        stream.end('ERROR: '+code);
    }
    switch(headers[':method']) {
        case 'GET': {
            const filePath = (headers[':path'] == '/')
                ? join(staticContentRoot, 'index.html')
                : join(staticContentRoot, headers[':path']);
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
server.listen(config.http.port);



gamepad.init();
for(let i = 0, l = gamepad.numDevices(); i < l; i++)
    console.log(i, gamepad.deviceAtIndex());
setInterval(gamepad.processEvents, 16);
setInterval(gamepad.detectDevices, 1000);
gamepad.on('move', (id, axis, value) => {
    console.log('move', {id, axis, value});
});
