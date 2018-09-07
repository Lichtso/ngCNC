import {vec3, mat3} from './gl-matrix.js';
import {gl, createShader, createProgram} from './Webgl.js';

const program = createProgram(gl, createShader(gl, gl.VERTEX_SHADER, `
uniform mat4 transform;
attribute vec4 position;
varying vec3 color;

void main() {
    gl_Position = transform*vec4(position.xyz, 1.0);
    color = vec3(1.0);
}`), createShader(gl, gl.FRAGMENT_SHADER, `
varying vec3 color;

void main() {
    gl_FragColor.rgb = color;
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
            let length = 0.0;
            switch(operation.type) {
                case 'Line':
                    length = vec3.distance(linearPosition, operation.linearPosition);
                    for(let i = 0; i < 3; ++i)
                        positions.push(operation.linearPosition[i]);
                    positions.push(time+length/operation.feedrate);
                    ++this.vertices;
                    break;
                case 'Helix': {
                    const startVec = vec3.create(), endVec = vec3.create(),
                          normal = vec3.create(), aux = vec3.create(), orientation = mat3.create();
                    vec3.sub(startVec, linearPosition, operation.helixCenter);
                    vec3.sub(endVec, operation.linearPosition, operation.helixCenter);
                    const startHeight = vec3.dot(startVec, operation.helixAxis),
                          endHeight = vec3.dot(endVec, operation.helixAxis);
                    vec3.scale(aux, operation.helixAxis, startHeight);
                    vec3.sub(startVec, startVec, aux);
                    const radius = vec3.length(startVec);
                    vec3.normalize(startVec, startVec);
                    vec3.scale(aux, operation.helixAxis, endHeight);
                    vec3.sub(endVec, endVec, aux);
                    vec3.normalize(endVec, endVec);
                    vec3.cross(normal, startVec, operation.helixAxis);
                    vec3.normalize(normal, normal);
                    mat3.set(orientation, startVec[0], startVec[1], startVec[2], normal[0], normal[1], normal[2], operation.helixAxis[0], operation.helixAxis[1], operation.helixAxis[2]);
                    let angle = Math.acos(vec3.dot(startVec, endVec));
                    if(angle == 0)
                        angle = Math.PI*2.0;
                    else if(vec3.dot(normal, endVec) < 0)
                        angle = Math.PI*2.0-angle;
                    const slope = (endHeight-startHeight)/angle;
                    length = Math.sqrt(radius*radius+slope*slope);
                    const vertexCount = Math.ceil(angle/this.arcPrecision);
                    for(let j = 1; j <= vertexCount; ++j) {
                        const t = j/vertexCount*angle;
                        vec3.set(aux, radius*Math.cos(t), radius*Math.sin(t), startHeight+slope*t);
                        vec3.transformMat3(aux, aux, orientation);
                        vec3.add(aux, aux, operation.helixCenter);
                        for(let i = 0; i < 3; ++i)
                            positions.push(aux[i]);
                        positions.push(time+t*length);
                        ++this.vertices;
                    }
                    length *= angle;
                } break;
            }
            if(operation.linearPosition) {
                time += length/operation.feedrate;
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
        gl.drawArrays(gl.LINE_STRIP, 0, this.vertices); // TODO: Visualize normal: gl.TRIANGLE_STRIP
    }
}
