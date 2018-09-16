import {quat, vec3, mat3, mat4} from './gl-matrix.js';
import {gl} from './Webgl.js';

export const Renderer = {
    camTransform: mat4.create()
};

const camRotation = quat.create(), prevCamRotation = quat.create(), nextCamRotation = quat.create(),
      camTranslation = vec3.create(), prevCamTranslation = vec3.create(), nextCamTranslation = vec3.create(),
      projection = mat4.create();
let zoom = 100, prevZoom = zoom, nextZoom = zoom, eventX, eventY;

export function updateCam() {
    mat4.fromQuat(Renderer.camTransform, camRotation);
    mat4.translate(Renderer.camTransform, Renderer.camTransform, camTranslation);
    mat4.multiply(Renderer.camTransform, projection, Renderer.camTransform);
    Renderer.render();
}

export function updateProjection() {
    const aspectRatio = gl.canvas.width/gl.canvas.height;
    switch(projectionMode.value) {
        case 'Orthographic':
            mat4.ortho(projection, -zoom*aspectRatio, zoom*aspectRatio, -zoom, zoom, -10000.0, 10000.0);
            break;
        case 'Perspective':
            mat4.perspective(projection, Math.PI*0.125, aspectRatio, 0.01, 10000.0);
            mat4.translate(projection, projection, vec3.fromValues(0.0, 0.0, -zoom*5.5));
            break;
    }
    updateCam();
}

function animateCam(callback, duration) {
    const startTime = performance.now();
    window.requestAnimationFrame(function animation(now) {
        const t = Math.min(1.0, (now-startTime)/duration);
        callback(t);
        updateCam();
        if(t < 1)
            window.requestAnimationFrame(animation);
    });
}

const projectionMode = document.getElementById('projectionMode');
projectionMode.onclick = function() {
    projectionMode.value = (projectionMode.value === 'Orthographic') ? 'Perspective' : 'Orthographic';
    updateProjection();
};

document.getElementById('center').onclick = function() {
    prevZoom = zoom;
    nextZoom = 100.0;
    vec3.copy(prevCamTranslation, camTranslation);
    vec3.scale(nextCamTranslation, nextCamTranslation, 0.0);
    animateCam(function(t) {
        zoom = prevZoom+(nextZoom-prevZoom)*t;
        updateProjection();
        vec3.lerp(camTranslation, prevCamTranslation, nextCamTranslation, t);
    }, 500);
};

const isometric = quat.create();
// quat.fromEuler(isometric, 45, 0, -90);
quat.rotateX(isometric, isometric, -Math.PI*0.25);
quat.rotateZ(isometric, isometric, -Math.PI*0.75);
const viewRotations = {
    'isometric': isometric,
    '-X': mat3.fromValues(0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0),
    '+X': mat3.fromValues(0.0, 0.0, -1.0, -1.0, 0.0, 0.0, 0.0, 1.0, 0.0),
    '-Y': mat3.fromValues(-1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 1.0, 0.0),
    '+Y': mat3.fromValues(1.0, 0.0, 0.0, 0.0, 0.0, -1.0, 0.0, 1.0, 0.0),
    '-Z': mat3.fromValues(1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0),
    '+Z': mat3.fromValues(-1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, -1.0)
};
// 'isometric': quat.fromValues(-0.1464466005563736, -0.8535533547401428, 0.3535533845424652),
// '-X': quat.fromValues(0.5, 0.5, 0.5, -0.5),
// '+X': quat.fromValues(0.5, -0.5, -0.5, -0.5),
// '-Y': quat.fromValues(0, 0.7071067690849304, 0.7071067690849304, 0),
// '+Y': quat.fromValues(-0.7071067690849304, 0, 0, 0.7071067690849304),
// '-Z': quat.fromValues(0, 0, 0, 1),
// '+Z': quat.fromValues(0, 1, 0, 0)

for(const name in viewRotations) {
    if(viewRotations[name].length == 9) {
        const quatenion = quat.create();
        quat.fromMat3(quatenion, viewRotations[name]);
        viewRotations[name] = quatenion;
    }
    document.getElementById(name).onclick = function() {
        quat.copy(prevCamRotation, camRotation);
        quat.copy(nextCamRotation, viewRotations[name]);
        animateCam(function(t) {
            quat.slerp(camRotation, prevCamRotation, nextCamRotation, t);
        }, 500);
    };
}

gl.canvas.onwheel = function(event) {
    zoom = Math.max(1.0, zoom+event.deltaY*0.1);
    updateProjection();
    event.stopPropagation();
    event.preventDefault();
};

function refineEvent(event) {
    if(event.touches) {
        event.modifierKey = (event.touches.length === 2);
        event.pointers = event.touches;
    } else {
        event.modifierKey = event.shiftKey;
        event.pointers = [event];
    }
    event.stopPropagation();
    event.preventDefault();
}

gl.canvas.onmousedown = gl.canvas.ontouchstart = function(event) {
    refineEvent(event);
    if(event.button != undefined && event.button != 1)
        return;
    eventX = event.pointers[0].pageX;
    eventY = event.pointers[0].pageY;
    quat.copy(prevCamRotation, camRotation);
    vec3.copy(prevCamTranslation, camTranslation);
};

gl.canvas.onmousemove = gl.canvas.ontouchmove = function(event) {
    if(eventX == undefined)
        return;
    refineEvent(event);
    const factor = window.devicePixelRatio/gl.canvas.height,
          diffX = (event.pointers[0].pageX-eventX)*factor,
          diffY = (event.pointers[0].pageY-eventY)*factor;
    if(event.modifierKey) {
        const rotation = mat3.create();
        mat3.fromQuat(rotation, camRotation);
        const vecX = vec3.fromValues(rotation[0], rotation[3], rotation[6]),
              vecY = vec3.fromValues(rotation[1], rotation[4], rotation[7]);
        vec3.scale(vecX, vecX, diffX*zoom*2.0);
        vec3.scale(vecY, vecY, diffY*zoom*-2.0);
        vec3.add(camTranslation, prevCamTranslation, vecX);
        vec3.add(camTranslation, camTranslation, vecY);
    } else {
        quat.rotateZ(camRotation, prevCamRotation, diffX*Math.PI);
        const rotation = quat.create();
        // quat.setAxisAngle(rotation, vec3.fromValues(1.0, 0.0, 0.0), diffY*Math.PI);
        quat.identity(rotation);
        quat.rotateX(rotation, rotation, diffY*Math.PI);
        quat.multiply(camRotation, rotation, camRotation);
    }
    updateCam();
};

gl.canvas.onmouseup = gl.canvas.onmouseleave = gl.canvas.ontouchend = gl.canvas.ontouchleave = gl.canvas.ontouchcancel = function(event) {
    refineEvent(event);
    eventX = eventY = undefined;
};