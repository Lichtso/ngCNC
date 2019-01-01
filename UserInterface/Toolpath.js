import {vec2, vec3, mat4} from './node_modules/gl-matrix/src/gl-matrix.js';
import {Shared, gl, createShader, createProgram} from './Webgl.js';

const program = createProgram(gl, createShader(gl, gl.VERTEX_SHADER, `
uniform mat4 transform;
attribute vec4 position;
varying float timestamp;

void main() {
    gl_Position = transform*vec4(position.xyz, 1.0);
    timestamp = position.w;
}`), createShader(gl, gl.FRAGMENT_SHADER, `
varying float timestamp;

void main() {
    gl_FragColor.rgb = vec3((mod(time, 1.0) < 0.5) ? 0.5 : 1.0);
    gl_FragColor.a = 1.0;
}`));

export class Toolpath {
    constructor(coordinateSystem) {
        this.coordinateSystem = coordinateSystem;
        this.vertices = 0;
        this.arcPrecision = 0.1;
    }

    load(operations) {
        let time = 0.0,
            prevLinearPosition = vec3.create(), // TODO: Starting position
            prevAngularPosition = vec2.create();
        const linearPosition = vec3.create(),
              angularPosition = vec2.create(),
              origin = vec3.create(),
              translation = vec3.create(),
              transform = mat4.create();
        mat4.getTranslation(origin, this.coordinateSystem.transform);
        vec3.scale(translation, origin, -1);
        console.log(origin, translation);
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
        for(const operation of operations) {
            if(!operation.linearPosition)
                continue;
            switch(operation.type) {
                case 'Line': {
                    const vertexCount = Math.max(1, Math.ceil(vec2.distance(prevAngularPosition, operation.angularPosition)/this.arcPrecision));
                    for(let j = 1; j <= vertexCount; ++j) {
                        const t = j/vertexCount;
                        vec3.lerp(linearPosition, prevLinearPosition, operation.linearPosition, t);
                        vec2.lerp(angularPosition, prevAngularPosition, operation.angularPosition, t);
                        updateTransform(transform);
                        vec3.transformMat4(linearPosition, linearPosition, transform);
                        for(let i = 0; i < 3; ++i)
                            positions.push(linearPosition[i]);
                        positions.push(time+t*operation.length/operation.feedrate);
                        ++this.vertices;
                    }
                } break;
                case 'Helix': {
                    const angleSlope = (operation.helixExitHeight-operation.helixEntryHeight)/operation.helixAngle,
                          angleLength = Math.hypot(operation.helixRadius, angleSlope),
                          vertexCount = Math.ceil((vec2.distance(prevAngularPosition, operation.angularPosition)+operation.helixAngle)/this.arcPrecision);
                    for(let j = 1; j <= vertexCount; ++j) {
                        const t = j/vertexCount*operation.helixAngle;
                        vec3.set(linearPosition, operation.helixRadius*Math.cos(t), operation.helixRadius*Math.sin(t), operation.helixEntryHeight+angleSlope*t);
                        vec2.lerp(angularPosition, prevAngularPosition, operation.angularPosition, t);
                        updateTransform(transform);
                        mat4.multiply(transform, transform, operation.transform);
                        vec3.transformMat4(linearPosition, linearPosition, transform);
                        for(let i = 0; i < 3; ++i)
                            positions.push(linearPosition[i]);
                        positions.push(time+t*angleLength);
                        ++this.vertices;
                    }
                } break;
            }
            time += operation.length/operation.feedrate;
            prevLinearPosition = operation.linearPosition;
            prevAngularPosition = operation.angularPosition;
        }
        if(!this.positionBuffer)
            this.positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    }

    render() {
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
        gl.uniformMatrix4fv(gl.getUniformLocation(program, 'transform'), false, transform);
        gl.enableVertexAttribArray(0);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.LINE_STRIP, 0, this.vertices);
    }
}
