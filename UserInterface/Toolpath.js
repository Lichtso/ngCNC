import {vec3, mat4} from './node_modules/gl-matrix/src/gl-matrix.js';
import {Shared, gl, createShader, createProgram} from './Webgl.js';

const program = createProgram(gl, createShader(gl, gl.VERTEX_SHADER, `
uniform mat4 transform;
attribute vec4 position;
varying float timestamp;

void main() {
    gl_Position = transform*vec4(position.xyz, 1.0);
    timestamp = position.w;
}`), createShader(gl, gl.FRAGMENT_SHADER, `
uniform vec2 selection;
uniform float timeThreshold, animationOffset;
varying float timestamp;

void main() {
    gl_FragColor.rgb = vec3(
        (timestamp <= timeThreshold) ? 1.0 :
        (mod(timestamp+animationOffset, 2.0) < 1.0) ? 0.25 : 0.75
    );
    if(timestamp >= selection.s && timestamp < selection.t)
        gl_FragColor.rgb *= vec3(2.0, 1.0, 0.0);
    gl_FragColor.a = 1.0;
}`));

export class Toolpath {
    constructor(coordinateSystem) {
        this.coordinateSystem = coordinateSystem;
        this.vertices = 0;
        this.arcPrecision = 0.1;
        this.selection = [];
        this.commands = [];
    }

    getCommandDescription(command) {
        switch(command.type) {
            case 'ToolLengthMeasurement':
                return 'Measure tool length';
            case 'SoftStop':
                return `Stop gracefully`;
            case 'HardStop':
                return `Stop abruptly`;
            case 'SpindleSpeed':
            case 'MaximumAccelleration':
            case 'MaximumFeedrate':
                return `Set ${command.type} to ${command.value}`;
            case 'Coolant':
            case 'Illumination':
                return `Switch ${command.type} ${command.value}`;
            case 'Line':
                return `Line to ${command.linearPosition} ${command.angularPosition}`;
            case 'Helix':
                return `Helix around ${command.helixAxisName} ${command.helixCenter} ${command.helixRadius} to ${command.linearPosition} ${command.angularPosition}`;
            default:
                return command.type;
        }
    }

    load(commands) {
        this.commands = commands;
        let time = 0.0,
            prevLinearPosition = vec3.create(), // TODO: Starting position
            prevAngularPosition = vec3.create();
        const linearPosition = vec3.create(),
              angularPosition = vec3.create(),
              origin = vec3.create(),
              translation = vec3.create(),
              transform = mat4.create();
        mat4.getTranslation(origin, this.coordinateSystem.transform);
        vec3.scale(translation, origin, -1);
        function updateTransform(transform) {
            mat4.fromTranslation(transform, origin);
            mat4.rotateX(transform, transform, -angularPosition[0]);
            mat4.rotateY(transform, transform, -angularPosition[1]);
            mat4.translate(transform, transform, translation);
        }
        const positions = [];
        for(let i = 0; i < 3; ++i)
            positions.push(prevLinearPosition[i]);
        positions.push(time);
        this.vertices = 1;
        for(const command of commands) {
            if(!command.linearPosition)
                continue;
            switch(command.type) {
                case 'Line': {
                    const vertexCount = Math.max(1, Math.ceil(vec3.distance(prevAngularPosition, command.angularPosition)/this.arcPrecision));
                    for(let j = 1; j <= vertexCount; ++j) {
                        const t = j/vertexCount;
                        vec3.lerp(linearPosition, prevLinearPosition, command.linearPosition, t);
                        vec3.lerp(angularPosition, prevAngularPosition, command.angularPosition, t);
                        updateTransform(transform);
                        vec3.transformMat4(linearPosition, linearPosition, transform);
                        for(let i = 0; i < 3; ++i)
                            positions.push(linearPosition[i]);
                        positions.push(time+t*command.length/command.feedrate);
                        ++this.vertices;
                    }
                } break;
                case 'Helix': {
                    const angleSlope = (command.helixExitHeight-command.helixEntryHeight)/command.helixAngle,
                          angleLength = Math.hypot(command.helixRadius, angleSlope),
                          vertexCount = Math.ceil((vec3.distance(prevAngularPosition, command.angularPosition)+command.helixAngle)/this.arcPrecision);
                    for(let j = 1; j <= vertexCount; ++j) {
                        const t = j/vertexCount*command.helixAngle;
                        vec3.set(linearPosition, command.helixRadius*Math.cos(t), command.helixRadius*Math.sin(t), command.helixEntryHeight+angleSlope*t);
                        vec3.lerp(angularPosition, prevAngularPosition, command.angularPosition, t);
                        updateTransform(transform);
                        mat4.multiply(transform, transform, command.transform);
                        vec3.transformMat4(linearPosition, linearPosition, transform);
                        for(let i = 0; i < 3; ++i)
                            positions.push(linearPosition[i]);
                        positions.push(time+t*angleLength);
                        ++this.vertices;
                    }
                } break;
            }
            command.timestamp = time;
            command.duration = command.length/command.feedrate;
            time += command.duration;
            prevLinearPosition = command.linearPosition;
            prevAngularPosition = command.angularPosition;
        }
        if(!this.positionBuffer)
            this.positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    }

    render(status) {
        if(!this.vertices)
            return;
        gl.useProgram(program);
        const translation = vec3.create(),
              transform = mat4.create();
        mat4.getTranslation(translation, this.coordinateSystem.transform);
        vec3.scale(translation, translation, -1);
        mat4.fromTranslation(transform, translation);
        mat4.multiply(transform, this.coordinateSystem.transform, transform);
        mat4.multiply(transform, Shared.camTransform, transform);
        let selectionStart = -1, selectionEnd = -1;
        for(const selection of this.selection) {
            const lastCommand = this.commands[selection.start+selection.length-1];
            selectionStart = this.commands[selection.start].timestamp;
            selectionEnd = lastCommand.timestamp+lastCommand.duration;
            break;
        }
        gl.uniform2f(gl.getUniformLocation(program, 'selection'), selectionStart, selectionEnd);
        let timeThreshold = -1;
        if(status.commandQueueIndex < this.commands.length) {
            const command = this.commands[status.commandQueueIndex];
            timeThreshold = command.timestamp+command.duration*status.progress;
        }
        gl.uniform1f(gl.getUniformLocation(program, 'timeThreshold'), timeThreshold);
        if(Shared.continuousAnimation)
            gl.uniform1f(gl.getUniformLocation(program, 'animationOffset'), performance.now()/1000.0);
        gl.uniformMatrix4fv(gl.getUniformLocation(program, 'transform'), false, transform);
        gl.enableVertexAttribArray(0);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.LINE_STRIP, 0, this.vertices);
    }
}
