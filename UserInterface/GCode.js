import {vec3} from './gl-matrix.js';

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
        this.prevLinearPosition = vec3.create();
        this.prevAngularPosition = vec3.create();
        this.interpolationMode = 'line';
        this.positionMode = 'absolute';
        for(const line of input.split('\n')) {
            let usedAddress = false;
            const commands = line.split(' ');
            for(const command of commands) {
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
        if(this.interpolationMode == 'Helix') {
            segment.helixAxis = [
                vec3.fromValues(this.helixDirection, 0, 0),
                vec3.fromValues(0, this.helixDirection, 0),
                vec3.fromValues(0, 0, this.helixDirection)
            ][this.helixAxis];
            segment.helixCenter = vec3.create();
            if(this.helixRadius != 0.0) {
                const tangent = vec3.create(), normal = vec3.create();
                vec3.sub(tangent, this.linearPosition, this.prevLinearPosition);
                vec3.scale(normal, segment.helixAxis, vec3.dot(tangent, segment.helixAxis));
                vec3.sub(tangent, tangent, normal);
                vec3.cross(normal, tangent, segment.helixAxis);
                vec3.normalize(normal, normal);
                const factor = Math.sqrt(this.helixRadius*this.helixRadius-vec3.squaredLength(tangent)*0.25);
                vec3.scale(normal, normal, (this.helixRadius < 0) ? -factor : factor);
                vec3.scale(tangent, tangent, 0.5);
                vec3.add(this.helixCenter, tangent, normal);
            }
            vec3.add(segment.helixCenter, this.prevLinearPosition, this.helixCenter);
        }
        this.operations.push(segment);
        vec3.copy(this.prevLinearPosition, this.linearPosition);
        vec3.copy(this.prevAngularPosition, this.angularPosition);
        vec3.set(this.helixCenter, 0.0, 0.0, 0.0);
        this.helixRadius = 0;
    }
}
