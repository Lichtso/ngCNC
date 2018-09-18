import {vec3, mat4} from './gl-matrix.js';

export class GCode {
    constructor(input) {
        this.operations = [];
        this.unitScale = 1;
        this.maxFeedrate = 10;
        this.rapidPositioning = false;
        this.feedrate = 1;
        this.helixRadius = 0;
        this.helixDirection = 1;
        this.helixAxis = 2;
        this.helixCenter = vec3.create();
        this.linearPosition = vec3.create();
        this.angularPosition = vec3.create();
        this.prevTangent = vec3.create();
        this.prevLinearPosition = vec3.create();
        this.prevAngularPosition = vec3.create();
        this.interpolationMode = 'line';
        this.positionMode = 'absolute';
        for(let line of input.split('\n')) {
            const commentIndex = Math.max(line.indexOf(';'), line.indexOf('('));
            if(commentIndex >= 0)
                line = line.substr(0, commentIndex);
            let usedAddress = false;
            for(const command of line.split(' ')) {
                const value = parseFloat(command.substr(1));
                switch(command[0]) {
                    // Not implemented: D E H L N O P Q R T U V W
                    case 'A':
                    case 'B':
                    case 'C':
                    case 'I':
                    case 'J':
                    case 'K':
                    case 'X':
                    case 'Y':
                    case 'Z':
                        usedAddress = true;
                        this.address(command.charCodeAt(0), value);
                        break;
                    case 'R':
                        usedAddress = true;
                        this.helixRadius = value*this.unitScale;
                        break;
                    case 'G':
                        this.codeG(value);
                        break;
                    case 'M':
                        this.codeM(value);
                        break;
                    case 'F':
                        this.feedrate = value*this.unitScale/60.0;
                        break;
                    case 'S':
                        this.operations.push({'type': 'SpindleSpeed', 'value': value/60.0});
                        break;
                }
            }
            if(usedAddress)
                this.segment();
        }
    }

    address(axis, value) {
        value *= this.unitScale;
        let vec;
        if(axis >= 88) { // X Y Z
            axis -= 88;
            vec = this.linearPosition;
        } else if(axis >= 73) { // I J K
            axis -= 73;
            this.helixCenter[axis] = value;
            return;
        } else { // A B C
            axis -= 65;
            vec = this.angularPosition;
        }
        if(this.positionMode == 'absolute')
            vec[axis] = value;
        else
            vec[axis] += value;
    }

    codeG(command) {
        switch(command) {
            case 0:
            case 1:
                this.rapidPositioning = (command == 0);
                this.interpolationMode = 'Line';
                break;
            case 2:
            case 3:
                this.rapidPositioning = false;
                this.helixDirection = (command == 2) ? 1 : -1;
                this.interpolationMode = 'Helix';
                break;
            // case 4: // TODO: Dwell
            case 17:
            case 18:
            case 19:
                this.helixAxis = 19-command;
                break;
            case 20:
                this.unitScale = 25.4;
                break;
            case 21:
                this.unitScale = 1.0;
                break;
            case 90:
                this.positionMode = 'absolute';
                break;
            case 91:
                this.positionMode = 'relative';
                break;
            case 100:
                // this.operations.push({'type': 'ToolLengthMeasurement'}); // TODO
                break;
            default:
                this.interpolationMode = undefined;
                break;
        }
    }

    codeM(value) {
        switch(command) {
            case 0:
                this.operations.push({'type': 'Stop'});
                break;
            case 3:
                this.operations.push({'type': 'Spindle', 'direction': 'CW'});
                break;
            case 4:
                this.operations.push({'type': 'Spindle', 'direction': 'CCW'});
                break;
            case 5:
                this.operations.push({'type': 'Spindle', 'direction': 'OFF'});
                break;
            case 7:
            case 8:
                this.operations.push({'type': 'Coolant', 'value': 'ON'});
                break;
            case 9:
                this.operations.push({'type': 'Coolant', 'value': 'OFF'});
                break;
        }
    }

    segment() {
        const segment = {
            'type': this.interpolationMode,
            'feedrate': (this.rapidPositioning) ? this.maxFeedrate : this.feedrate,
            'linearPosition': vec3.clone(this.linearPosition),
            'angularPosition': vec3.clone(this.angularPosition)
        };
        const diffVec = vec3.create();
        vec3.sub(diffVec, this.linearPosition, this.prevLinearPosition);
        switch(this.interpolationMode) {
            case 'Line': {
                segment.length = vec3.length(diffVec);
                segment.entryTangent = segment.exitTangent = vec3.create();
                vec3.scale(segment.exitTangent, diffVec, 1.0/segment.length);
            } break;
            case 'Helix': {
                segment.helixCenter = vec3.create();
                segment.helixAxis = vec3.create();
                segment.helixAxis[this.helixAxis] = this.helixDirection;
                if(this.helixRadius != 0.0) {
                    vec3.scaleAndAdd(diffVec, diffVec, segment.helixAxis, -vec3.dot(diffVec, segment.helixAxis));
                    const sidewaysDistance = Math.sqrt(this.helixRadius*this.helixRadius-vec3.squaredLength(diffVec)*0.25),
                          sideways = vec3.create();
                    vec3.cross(sideways, diffVec, segment.helixAxis);
                    vec3.normalize(sideways, sideways);
                    vec3.scale(sideways, sideways, (this.helixRadius < 0) ? -sidewaysDistance : sidewaysDistance);
                    vec3.scaleAndAdd(this.helixCenter, sideways, diffVec, 0.5);
                }
                vec3.add(segment.helixCenter, this.prevLinearPosition, this.helixCenter);
                const entryVec = vec3.create(),
                      exitVec = vec3.create();
                vec3.sub(entryVec, this.prevLinearPosition, segment.helixCenter);
                vec3.sub(exitVec, this.linearPosition, segment.helixCenter);
                segment.helixEntryHeight = vec3.dot(entryVec, segment.helixAxis);
                segment.helixExitHeight = vec3.dot(exitVec, segment.helixAxis);
                vec3.scaleAndAdd(entryVec, entryVec, segment.helixAxis, -segment.helixEntryHeight);
                vec3.scaleAndAdd(exitVec, exitVec, segment.helixAxis, -segment.helixExitHeight);
                segment.helixRadius = vec3.length(entryVec);
                vec3.normalize(entryVec, entryVec);
                vec3.normalize(exitVec, exitVec);
                segment.entryTangent = vec3.create();
                segment.exitTangent = vec3.create();
                vec3.cross(segment.entryTangent, entryVec, segment.helixAxis);
                vec3.cross(segment.exitTangent, exitVec, segment.helixAxis);
                vec3.normalize(segment.entryTangent, segment.entryTangent);
                vec3.normalize(segment.exitTangent, segment.exitTangent);
                segment.transformation = mat4.fromValues(
                    entryVec[0], entryVec[1], entryVec[2], 0,
                    segment.entryTangent[0], segment.entryTangent[1], segment.entryTangent[2], 0,
                    segment.helixAxis[0], segment.helixAxis[1], segment.helixAxis[2], 0,
                    segment.helixCenter[0], segment.helixCenter[1], segment.helixCenter[2], 0
                );
                segment.helixAngle = Math.acos(vec3.dot(entryVec, exitVec));
                if(segment.helixAngle == 0)
                    segment.helixAngle = Math.PI*2.0;
                else if(vec3.dot(segment.entryTangent, exitVec) < 0)
                    segment.helixAngle = Math.PI*2.0-segment.helixAngle;
                segment.length = Math.hypot(segment.helixRadius*segment.helixAngle, segment.helixExitHeight-segment.helixEntryHeight);
                const aux = vec3.create();
                vec3.scale(aux, segment.helixAxis, (segment.helixExitHeight-segment.helixEntryHeight)/segment.length);
                vec3.add(segment.entryTangent, segment.entryTangent, aux);
                vec3.add(segment.exitTangent, segment.exitTangent, aux);
                vec3.normalize(segment.entryTangent, segment.entryTangent);
                vec3.normalize(segment.exitTangent, segment.exitTangent);
            } break;
            default:
                return;
        }
        segment.entrySpeedFactor = Math.max(0.0, vec3.dot(this.prevTangent, segment.entryTangent));
        this.operations.push(segment);
        vec3.copy(this.prevTangent, segment.exitTangent);
        vec3.copy(this.prevLinearPosition, this.linearPosition);
        vec3.copy(this.prevAngularPosition, this.angularPosition);
        vec3.set(this.helixCenter, 0.0, 0.0, 0.0);
        this.helixRadius = 0;
    }
}
