import {vec3, mat4} from './node_modules/gl-matrix/esm/index.js';
import {Shared, gl, createShader, createProgram} from './Webgl.js';
import {Arrow, program} from './Arrow.js';

export class CoordinateSystem {
    constructor(bounds) {
        this.transform = mat4.create();
        const axes = [
            new Arrow(vec3.fromValues(bounds[0], 0, 0), vec3.fromValues(1.0, 0.0, 0.0)),
            new Arrow(vec3.fromValues(0, bounds[1], 0), vec3.fromValues(0.0, 1.0, 0.0)),
            new Arrow(vec3.fromValues(0, 0, bounds[2]), vec3.fromValues(0.3, 0.5, 1.0))
        ];
        this.positions = new Float32Array(axes[0].positions.length+axes[1].positions.length+axes[2].positions.length);
        this.positions.set(axes[0].positions, 0);
        this.positions.set(axes[1].positions, axes[0].positions.length);
        this.positions.set(axes[2].positions, axes[0].positions.length+axes[1].positions.length);
        this.colors = new Float32Array(axes[0].colors.length+axes[1].colors.length+axes[2].colors.length);
        this.colors.set(axes[0].colors, 0);
        this.colors.set(axes[1].colors, axes[0].colors.length);
        this.colors.set(axes[2].colors, axes[0].colors.length+axes[1].colors.length);
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
        gl.drawArrays(gl.LINES, 0, 6);
        gl.disableVertexAttribArray(1);
    }
}
