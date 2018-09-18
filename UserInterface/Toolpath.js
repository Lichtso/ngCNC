import {vec3} from './gl-matrix.js';
import {gl, createShader, createProgram} from './Webgl.js';

const program = createProgram(gl, createShader(gl, gl.VERTEX_SHADER, `
uniform mat4 transform;
attribute vec4 position;
varying float time;

void main() {
    gl_Position = transform*vec4(position.xyz, 1.0);
    time = position.w;
}`), createShader(gl, gl.FRAGMENT_SHADER, `
varying float time;

void main() {
    gl_FragColor.rgb = vec3((mod(time, 1.0) < 0.5) ? 0.5 : 1.0);
    gl_FragColor.a = 1.0;
}`));

export class Toolpath {
    constructor() {
        this.vertices = 0;
        this.arcPrecision = 0.1;
    }

    load(operations) {
        let time = 0.0, linearPosition = vec3.create(), angularPosition = vec3.create();
        const positions = [];
        for(let i = 0; i < 3; ++i)
            positions.push(linearPosition[i]);
        positions.push(time);
        this.vertices = 1;
        for(const operation of operations) {
            switch(operation.type) {
                case 'Line': {
                    for(let i = 0; i < 3; ++i)
                        positions.push(operation.linearPosition[i]);
                    positions.push(time+operation.length/operation.feedrate);
                    ++this.vertices;
                } break;
                case 'Helix': {
                    const angleSlope = (operation.helixExitHeight-operation.helixEntryHeight)/operation.helixAngle,
                          angleLength = Math.hypot(operation.helixRadius, angleSlope),
                          position = vec3.create(),
                          vertexCount = Math.ceil(operation.helixAngle/this.arcPrecision);
                    for(let j = 1; j <= vertexCount; ++j) {
                        const t = j/vertexCount*operation.helixAngle;
                        vec3.set(position, operation.helixRadius*Math.cos(t), operation.helixRadius*Math.sin(t), operation.helixEntryHeight+angleSlope*t);
                        vec3.transformMat4(position, position, operation.transformation);
                        for(let i = 0; i < 3; ++i)
                            positions.push(position[i]);
                        positions.push(time+t*angleLength);
                        ++this.vertices;
                    }
                } break;
            }
            if(operation.linearPosition) {
                time += operation.length/operation.feedrate;
                linearPosition = operation.linearPosition;
                angularPosition = operation.angularPosition;
            }
        }
        if(!this.positionBuffer)
            this.positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    }

    render(transform) {
        if(!this.vertices)
            return;
        gl.useProgram(program);
        gl.uniformMatrix4fv(gl.getUniformLocation(program, 'transform'), false, transform);
        gl.enableVertexAttribArray(0);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.LINE_STRIP, 0, this.vertices);
    }
}
