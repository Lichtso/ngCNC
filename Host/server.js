const fs = require('fs'),
      path = require('path'),
      http2 = require('http2'),
      hostingRoot = '../Interface',
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
