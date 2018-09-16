import {gl, createShader, createProgram} from './Webgl.js';

const program = createProgram(gl, createShader(gl, gl.VERTEX_SHADER, `
uniform mat4 transform;
attribute vec4 position;
attribute vec3 color;
varying vec3 fragColor;

void main() {
    gl_Position = transform*position;
    fragColor = color;

}`), createShader(gl, gl.FRAGMENT_SHADER, `
varying vec3 fragColor;

void main() {
    gl_FragColor = vec4(fragColor, 1.0);
}`));

export class Axes {
    constructor() {
        this.positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            0.0, 0.0, 0.0, 100.0, 0.0, 0.0,
            0.0, 0.0, 0.0, 0.0, 100.0, 0.0,
            0.0, 0.0, 0.0, 0.0, 0.0, 100.0
        ]), gl.STATIC_DRAW);
        this.colorBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            1.0, 0.0, 0.0, 1.0, 0.0, 0.0,
            0.0, 1.0, 0.0, 0.0, 1.0, 0.0,
            0.0, 0.0, 1.0, 0.0, 0.0, 1.0
        ]), gl.STATIC_DRAW);
    }

    render(transform) {
        gl.useProgram(program);
        gl.uniformMatrix4fv(gl.getUniformLocation(program, 'transform'), false, transform);
        gl.enableVertexAttribArray(0);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(1);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.LINES, 0, 6);
        gl.disableVertexAttribArray(1);
    }
}
