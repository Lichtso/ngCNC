import {mat4} from './node_modules/gl-matrix/esm/index.js';
import {Shared, gl, createShader, createProgram} from './Webgl.js';

export const program = createProgram(gl, createShader(gl, gl.VERTEX_SHADER, `
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

export class Arrow {
    constructor(dir, color) {
        this.transform = mat4.create();
        this.positions = new Float32Array([
            0.0, 0.0, 0.0, dir[0], dir[1], dir[2]
        ]);
        this.colors = new Float32Array([
            color[0], color[1], color[2], color[0], color[1], color[2]
        ]);
    }

    render() {
        if(!this.positionBuffer) {
            this.positionBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, this.positions, gl.STATIC_DRAW);
            this.colorBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, this.colors, gl.STATIC_DRAW);
        }
        gl.useProgram(program);
        const transform = mat4.create();
        mat4.multiply(transform, Shared.camTransform, this.transform);
        gl.uniformMatrix4fv(gl.getUniformLocation(program, 'transform'), false, transform);
        gl.enableVertexAttribArray(0);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(1);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.LINES, 0, 2);
        gl.disableVertexAttribArray(1);
    }
}
