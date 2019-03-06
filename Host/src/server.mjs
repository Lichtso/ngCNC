const HID = require('node-hid'),
      serialport = require('serialport'),
      fs = require('fs'),
      {extname, join, resolve} = require('path'),
      {createSecureServer} = require('http2');

process.on('uncaughtException', e => console.error(e));
process.on('unhandledRejection', reason => console.error(reason));

function loadConfig(dir) {
    if(dir === undefined)
        dir = process.env.CONFIGURATION_DIRECTORY || join(__dirname, '..', 'config');
    let config = {
        'http': {
            'port': 8443,
            'key': 'key.pem',
            'cert': 'cert.pem'
        },
        'gamepad': {
            'vid': 121, // DragonRise Inc.
            'pid': 6 // TwinShock
        },
        'serial': {
            'path': '/dev/tty.usbmodem274',
            'baudRate': 115200
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
const config = loadConfig();



const staticContentRoot = join(__dirname, '..', '..', 'UserInterface'),
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
    function sendErrorMessage(code) {
        stream.respond({':status': code});
        stream.end('Error: '+code);
    }
    let filePath;
    if(headers[':path'].startsWith('/node_modules/'))
        filePath = join(__dirname, '..', headers[':path']);
    else if(headers[':path'].startsWith('/socket/')) {
        const srcSocket = sockets.get(parseInt(headers[':path'].substr(8)));
        if(!srcSocket) {
            sendErrorMessage(500);
            return;
        }
        stream.data = [];
        stream.on('data', (data) => {
            stream.data.push(data);
        });
        stream.on('end', () => {
            stream.respond({':status': 200});
            stream.end();
            const data = JSON.parse(Buffer.concat(stream.data));
            switch(data.type) {
                case 'CommandQueue': {
                    commandQueue = data.commands;
                    const packetStr = `data: ${JSON.stringify({'type': 'CommandQueue', 'commands': commandQueue})}\n\n`;
                    for(const dstSocket of sockets.values())
                        if(dstSocket != srcSocket)
                            dstSocket.write(packetStr);
                } break;
            }
        });
        return;
    } else switch(headers[':path']) {
        case '/socket':
            stream.respond({':status': 200, 'content-type': 'text/event-stream', 'Cache-Control': 'no-cache'});
            stream.write(`event: uplink\ndata: /socket/${stream.id}\n\n`);
            stream.write(`data: ${JSON.stringify({'type': 'CommandQueue', 'commands': commandQueue})}\n\n`);
            stream.on('close', () => {
                sockets.delete(stream.id);
            });
            sockets.set(stream.id, stream);
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



function handleGamepadAxisCross(index, x, y) {
    console.log('Gamepad: Axis Cross', index, x, y);
    if(status.linearPosition && (index == 0 || index == 2)) {
        let command = 'SoftStop';
        if(x != 0 || y != 0) {
            command = {'type': 'Line', 'length': 1000.0, 'feedrate': gamepadInputState.feedrate, 'endFeedrate': 0.0, 'linearPosition': [...status.linearPosition], 'angularPosition': status.angularPosition};
            if(index == 0) {
                command.linearPosition[0] += x*command.length;
                command.linearPosition[1] -= y*command.length;
            } else
                command.linearPosition[2] -= y*command.length;
            command = `HardStop\nLine ${command.length} ${command.feedrate} ${command.endFeedrate} ${command.linearPosition.join(' ')} ${command.angularPosition.slice(0, 2).join(' ')}`;
        }
        sendToRealtimeControl(command);
    }
}
function handleGamepadButton(index, pressed) {
    console.log('Gamepad: Button', index, pressed);
    switch(index) {
        case 0:
            sendToRealtimeControl(`Coolant ${(pressed) ? 'ON' : 'OFF'}`);
            break;
        case 1:
            sendToRealtimeControl(`Illumination ${(pressed) ? 'ON' : 'OFF'}`);
            break;
        case 2:
            if(!pressed)
                return;
            sendToRealtimeControl('SetOrigin');
            break;
        case 4:
        case 6:
            if(!pressed)
                return;
            gamepadInputState.feedrate += (index == 6 ? -1 : 1);
            gamepadInputState.feedrate = Math.min(Math.max(0, gamepadInputState.feedrate), 5);
            break;
        case 5:
        case 7:
            if(!pressed)
                return;
            gamepadInputState.spindleSpeed += (index == 7) ? -10 : 10;
            sendToRealtimeControl(`SpindleSpeed ${gamepadInputState.spindleSpeed}`);
            break;
    }
}
function handleGamepadReport(data) {
    gamepadInputState.active = (data[7] == 0x40);
    if(!gamepadInputState.active)
        return;
    const axes = [data[0], data[1], data[3], data[4]].map(x => Math.max(-1, (x-128)/127)).concat([
        [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
        [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]
    ][data[5]&0xF]);
    for(let i = 0; i < axes.length; i += 2) {
        let factor = Math.hypot(axes[i], axes[i+1]);
        factor = (factor == 0.0) ? 0.0 : 1.0/factor;
        axes[i] *= factor;
        axes[i+1] *= factor;
    }
    const buttons = [];
    for(let i = 4; i < 16; ++i) {
        const byte = 5+Math.floor(i/8);
        buttons[i-4] = (data[byte]>>(i%8))&1;
    }
    for(let i = 0; i < axes.length; i += 2)
        if(gamepadInputState.axes[i] != axes[i] || gamepadInputState.axes[i+1] != axes[i+1])
            handleGamepadAxisCross(i/2, axes[i], axes[i+1]);
    for(let i = 0; i < buttons.length; ++i)
        if(gamepadInputState.buttons[i] != buttons[i])
            handleGamepadButton(i, buttons[i]);
    gamepadInputState.axes = axes;
    gamepadInputState.buttons = buttons;
}
try {
    const gamepad = new HID.HID(config.gamepad.vid, config.gamepad.pid),
          gamepadInputState = {'axes': [], 'buttons': [], 'active': false, 'feedrate': 0, 'spindleSpeed': 0};
    gamepad.on('error', function(error) {
        console.log('Gamepad: '+error);
    });
    gamepad.on('data', handleGamepadReport);
} catch(error) {
    console.log('Gamepad: '+error);
}



let commandQueue = [];
const status = {
    'readyFlag': true,
    'commandQueueIndex': -1,
    'workpieceOrigin': [0, 0, 0]
};
function receiveFromRealtimeControl(data) {
    console.log('From Realtime Control: '+data);
    data = data.split(' ');
    const packet = {'type': data[0], 'timestamp': parseFloat(data[1])};
    switch(data[0]) {
        case 'OK':
            status.readyFlag = true;
            status.progress = 0;
            break;
        case 'Status':
            status.linearPosition = data.slice(2, 5).map((x) => parseFloat(x));
            status.angularPosition = data.slice(5, 7).map((x) => parseFloat(x));
            status.progress = parseFloat(data[7]);
            status.commandsInQueue = commandQueue.length;
            status.currentFeedrate = parseFloat(data[8]);
            status.currentSpindleSpeed = parseFloat(data[9]);
            packet.status = status;
            break;
        case 'Error':
            packet.message = data.slice(2).join(' ');
            status.commandQueueIndex = -1;
            commandQueue = [];
            break;
    }
    if(status.readyFlag && status.progress == -1.0 && commandQueue.length > 0 && ++status.commandQueueIndex < commandQueue.length) {
        const command = commandQueue[status.commandQueueIndex];
        let response;
        switch(command.type) {
            case 'SoftStop':
            case 'HardStop':
                response = command.type;
                break;
            case 'SpindleSpeed':
            case 'MinimumFeedrate':
            case 'MaximumAccelleration':
            case 'Coolant':
            case 'Illumination':
                response = `${command.type} ${command.value}`;
                break;
            case 'Line':
                response = `${command.type} ${command.length} ${command.feedrate} ${command.endFeedrate} ${command.linearPosition.join(' ')} ${command.angularPosition.slice(0, 2).join(' ')}`;
                break;
            case 'Helix':
                response = `${command.type} ${command.length} ${command.feedrate} ${command.endFeedrate} ${command.linearPosition.join(' ')} ${command.angularPosition.slice(0, 2).join(' ')} ${command.helixCenter.join(' ')} ${command.helixAxisName}`;
                break;
        }
        if(status.commandQueueIndex > commandQueue.length)
            status.commandQueueIndex = commandQueue.length;
        sendToRealtimeControl(response);
    }
    const packetStr = `data: ${JSON.stringify(packet)}\n\n`;
    for(const dstSocket of sockets.values())
        dstSocket.write(packetStr);
}
function sendToRealtimeControl(data) {
    console.log('To Realtime Control: '+data);
    serial.write(data+'\n');
    status.readyFlag = false;
}
try {
    const serial = new serialport(config.serial.path, config.serial);
    serial.pipe(new serialport.parsers.Readline()).on('data', receiveFromRealtimeControl);
} catch(error) {
    console.log('Realtime Control: '+error);
}
