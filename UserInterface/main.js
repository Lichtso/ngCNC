import {glMatrix, vec3, mat4} from './node_modules/gl-matrix/src/gl-matrix.js';
import {Shared, gl} from './Webgl.js';
import {updateProjection} from './Cam.js';
import {CoordinateSystem} from './CoordinateSystem.js';
import {Arrow} from './Arrow.js';
import {Toolpath} from './Toolpath.js';
import {parseGCode} from './GCode.js';

const machineCoordinateSystem = new CoordinateSystem(vec3.fromValues(100, 100, 100)),
      workpieceCoordinateSystem = new CoordinateSystem(vec3.fromValues(50, 50, 50)),
      positionIndicator = new Arrow(vec3.fromValues(0, 0, 100), vec3.fromValues(1.0, 0.0, 1.0)),
      toolpath = new Toolpath(workpieceCoordinateSystem),
      status = {
    'commandQueueIndex': -1,
    'progress': 0,
    'workpieceOrigin': [0, 0, 0],
    'linearPosition': [0, 0, 0],
    'angularPosition': [0, 0, 0]
};

Shared.render = () => {
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    machineCoordinateSystem.render();
    workpieceCoordinateSystem.render();
    positionIndicator.render();
    toolpath.render(status);
};
updateProjection();

function updateStatus() {
    mat4.identity(workpieceCoordinateSystem.transform);
    mat4.translate(workpieceCoordinateSystem.transform, workpieceCoordinateSystem.transform, status.workpieceOrigin);
    mat4.rotateX(workpieceCoordinateSystem.transform, workpieceCoordinateSystem.transform, status.angularPosition[0]);
    mat4.rotateY(workpieceCoordinateSystem.transform, workpieceCoordinateSystem.transform, status.angularPosition[1]);
    mat4.identity(positionIndicator.transform);
    mat4.translate(positionIndicator.transform, positionIndicator.transform, status.linearPosition);
}
updateStatus();

document.getElementById('file').onchange = (event) => {
    const reader = new FileReader();
    reader.onload = function(event) {
        updateCommandQueue(parseGCode(event.target.result, status.workpieceOrigin));
        socket.send({'type': 'CommandQueue', 'commands': toolpath.commands});
    };
    reader.readAsText(event.target.files[0]);
};

const commandQueue = document.getElementById('commandQueue');
commandQueue.onchange = (event) => {
    toolpath.selection = [];
    let lastSlice;
    for(let i = 0; i < toolpath.commands.length; ++i) {
        if(commandQueue.children[i].selected) {
            if(lastSlice)
                ++lastSlice.length;
            else {
                lastSlice = {'start': i, 'length': 1};
                toolpath.selection.push(lastSlice);
            }
        } else
            lastSlice = undefined;
    }
    Shared.render();
};

function updateCommandQueue(commands) {
    toolpath.load(commands);
    while(commandQueue.children.length > 0)
        commandQueue.removeChild(commandQueue.children[0]);
    for(let i = 0; i < toolpath.commands.length; ++i) {
        const entry = document.createElement('option');
        entry.value = i;
        entry.textContent = toolpath.getCommandDescription(toolpath.commands[i]);
        commandQueue.appendChild(entry);
    }
    Shared.render();
}

export class Socket {
    constructor() {
        const source = new EventSource('/socket');
        source.addEventListener('uplink', (event) => {
            this.name = event.data;
        });
        source.addEventListener('error', (event) => {
            source.close();
        });
        source.addEventListener('message', (event) => {
            this.ondata(JSON.parse(event.data));
        });
    }

    send(data) {
        data = JSON.stringify(data, (key, value) => {
            return (value instanceof glMatrix.ARRAY_TYPE) ? [...value.values()] : value;
        });
        fetch(this.name, {'headers': {'Content-Type': 'application/json'}, 'method': 'POST', 'body': data});
    }
};
const socket = new Socket();

socket.ondata = (data) => {
    switch(data.type) {
        case 'Error':
            alert(data.message);
            break;
        case 'Status':
            for(const key in data.status)
                status[key] = data.status[key];
            updateStatus();
            Shared.render();
            break;
        case 'CommandQueue':
            updateCommandQueue(data.commands)
            break;
    }
};
