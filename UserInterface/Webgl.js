export const Shared = {};
export const gl = document.getElementsByTagName('canvas')[0].getContext('webgl');

gl.canvas.height = gl.canvas.clientHeight*window.devicePixelRatio;
gl.canvas.width = gl.canvas.clientWidth*window.devicePixelRatio;
gl.viewport(0, 0, gl.canvas.clientWidth*window.devicePixelRatio, gl.canvas.clientHeight*window.devicePixelRatio);
gl.clearColor(0.0, 0.0, 0.0, 1.0);
gl.enable(gl.DEPTH_TEST);

export function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    shader.uniformBindings = new Map();
    while(true) {
        const match = /layout\(binding\s*=\s*([0-9]+)\)\s*uniform\s*([^;]*)\s(.*);/g.exec(source);
        if(!match)
            break;
        source = source.replace(match[0], 'uniform '+match[2]+' '+match[3]+';');
        shader.uniformBindings.set(match[3], match[1]);
    }
    gl.shaderSource(shader, `
#define M_PI 3.1415926535897932384626433832795
precision mediump float;
`+source);
    gl.compileShader(shader);
    if(gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        return shader;
    console.warn(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
};

export function createProgram(gl, vertexShader, fragmentShader) {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if(gl.getProgramParameter(program, gl.LINK_STATUS)) {
        gl.useProgram(program);
        for(const [name, binding] of fragmentShader.uniformBindings)
            gl.uniform1i(gl.getUniformLocation(program, name), binding);
        return program;
    }
    console.warn(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
};
