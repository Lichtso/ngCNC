import {glMatrix, vec3, mat4} from './node_modules/gl-matrix/src/gl-matrix.js';
import {Shared, gl} from './Webgl.js';
import {updateProjection} from './Cam.js';
import {CoordinateSystem} from './CoordinateSystem.js';
import {Arrow} from './Arrow.js';
import {Toolpath} from './Toolpath.js';
import {parseGCode} from './GCode.js';

const machineCoordinateSystem = new CoordinateSystem(vec3.fromValues(100, 100, 100)),
      workpieceCoordinateSystem = new CoordinateSystem(vec3.fromValues(50, 50, 50)),
      positionIndicator = new Arrow(vec3.fromValues(0, 0, 1000), vec3.fromValues(1.0, 0.0, 1.0)),
      toolpath = new Toolpath(workpieceCoordinateSystem),
      status = {
    'workpieceOrigin': [0, 0, 0],
    'linearPosition': [0, 0, 0],
    'angularPosition': [0, 0]
};

Shared.render = () => {
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    machineCoordinateSystem.render();
    workpieceCoordinateSystem.render();
    positionIndicator.render();
    toolpath.render();
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
        const commands = parseGCode(event.target.result, status.workpieceOrigin);
        toolpath.load(commands);
        Shared.render();
    };
    reader.readAsText(event.target.files[0]);
};

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
