import {gl} from './Webgl.js';
import {Renderer, updateProjection} from './Cam.js';
import {Axes} from './Axes.js';
import {Toolpath} from './Toolpath.js';
import {GCode} from './GCode.js';

const axes = new Axes();
const toolpath = new Toolpath();

Renderer.render = function() {
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    axes.render(Renderer.camTransform);
    toolpath.render(Renderer.camTransform);
}
updateProjection();

document.getElementById('file').onchange = function(event) {
    const reader = new FileReader();
    reader.onload = function(event) {
        const gcode = new GCode(event.target.result);
        toolpath.load(gcode.operations);
        Renderer.render();
    };
    reader.readAsText(event.target.files[0]);
};
