import {vec3, mat4} from './node_modules/gl-matrix/src/gl-matrix.js';

export function parseGCode(gcode, origin) {
    const commands = [],
          helixCenter = vec3.create(),
          linearPosition = vec3.create(),
          angularPosition = vec3.create();
    let unitScale = 1,
        spindleSpeed = 0,
        spindleDirection = 0,
        maxFeedrate = 10,
        rapidPositioning = false,
        feedrate = 1,
        helixRadius = 0,
        helixDirection = 1,
        helixAxis = 2,
        coordinatedMotionMode = 'line',
        positionMode = 'absolute',
        auxParameter,
        prevCoordinatedMotionCommand;

    const address = (axis, value) => {
        value *= unitScale;
        let vec;
        if(axis >= 88 && axis <= 90) { // X Y Z
            axis -= 88;
            vec = linearPosition;
        } else if(axis >= 73 && axis <= 75) { // I J K
            axis -= 73;
            helixCenter[axis] = value;
            return;
        } else { // A B C
            axis -= 65;
            vec = angularPosition;
        }
        if(positionMode == 'absolute')
            vec[axis] = value;
        else
            vec[axis] += value;
    };

    const codeG = (value) => {
        switch(value) {
            case 0:
            case 1:
                rapidPositioning = (value == 0);
                coordinatedMotionMode = 'Line';
                break;
            case 2:
            case 3:
                rapidPositioning = false;
                helixDirection = (value == 2) ? 1 : -1;
                coordinatedMotionMode = 'Helix';
                break;
            // case 4: // TODO: Dwell
            case 17:
            case 18:
            case 19:
                helixAxis = 19-value;
                break;
            case 20:
                unitScale = 25.4;
                break;
            case 21:
                unitScale = 1.0;
                break;
            case 90:
                positionMode = 'absolute';
                break;
            case 91:
                positionMode = 'relative';
                break;
            case 100:
                commands.push({'type': 'ToolLengthMeasurement'});
                break;
            default:
                coordinatedMotionMode = undefined;
                break;
        }
    };

    const codeM = (value) => {
        switch(value) {
            case 0:
                commands.push({'type': 'Pause'});
                break;
            case 3:
                spindleDirection = 1;
                commands.push({'type': 'SpindleSpeed', 'value': spindleDirection*spindleSpeed});
                break;
            case 4:
                spindleDirection = -1;
                commands.push({'type': 'SpindleSpeed', 'value': spindleDirection*spindleSpeed});
                break;
            case 5:
                spindleDirection = 0;
                commands.push({'type': 'SpindleSpeed', 'value': spindleDirection*spindleSpeed});
                break;
            case 7:
            case 8:
                commands.push({'type': 'Coolant', 'value': 'ON'});
                break;
            case 9:
                commands.push({'type': 'Coolant', 'value': 'OFF'});
                break;
        }
    };

    const coordinatedMotionCommand = () => {
        const command = {
            'type': coordinatedMotionMode,
            'feedrate': (rapidPositioning) ? maxFeedrate : feedrate,
            'linearPosition': vec3.create(),
            'angularPosition': vec3.create()
        };
        vec3.add(command.linearPosition, linearPosition, origin);
        vec3.scale(command.angularPosition, angularPosition, Math.PI/180.0);
        const diffVec = vec3.create(),
              prevLinearPosition = (prevCoordinatedMotionCommand) ? prevCoordinatedMotionCommand.linearPosition : vec3.create();
        vec3.sub(diffVec, command.linearPosition, prevLinearPosition);
        switch(coordinatedMotionMode) {
            case 'Line': {
                command.length = vec3.length(diffVec);
                command.entryTangent = command.exitTangent = vec3.create();
                vec3.scale(command.exitTangent, diffVec, 1.0/command.length);
            } break;
            case 'Helix': {
                command.helixCenter = vec3.create();
                command.helixAxisName = (helixDirection == -1 ? '-' : '+')+['X', 'Y', 'Z'][helixAxis];
                command.helixAxis = vec3.create();
                command.helixAxis[helixAxis] = helixDirection;
                if(helixRadius != 0.0) {
                    vec3.scaleAndAdd(diffVec, diffVec, command.helixAxis, -vec3.dot(diffVec, command.helixAxis));
                    const sidewaysDistance = Math.sqrt(helixRadius*helixRadius-vec3.squaredLength(diffVec)*0.25),
                          sideways = vec3.create();
                    vec3.cross(sideways, diffVec, command.helixAxis);
                    vec3.normalize(sideways, sideways);
                    vec3.scale(sideways, sideways, (helixRadius < 0) ? -sidewaysDistance : sidewaysDistance);
                    vec3.scaleAndAdd(helixCenter, sideways, diffVec, 0.5);
                }
                vec3.add(command.helixCenter, prevLinearPosition, helixCenter);
                const entryVec = vec3.create(),
                      exitVec = vec3.create();
                vec3.sub(entryVec, prevLinearPosition, command.helixCenter);
                vec3.sub(exitVec, command.linearPosition, command.helixCenter);
                command.helixEntryHeight = vec3.dot(entryVec, command.helixAxis);
                command.helixExitHeight = vec3.dot(exitVec, command.helixAxis);
                vec3.scaleAndAdd(entryVec, entryVec, command.helixAxis, -command.helixEntryHeight);
                vec3.scaleAndAdd(exitVec, exitVec, command.helixAxis, -command.helixExitHeight);
                command.helixRadius = vec3.length(entryVec);
                vec3.normalize(entryVec, entryVec);
                vec3.normalize(exitVec, exitVec);
                command.entryTangent = vec3.create();
                command.exitTangent = vec3.create();
                vec3.cross(command.entryTangent, entryVec, command.helixAxis);
                vec3.cross(command.exitTangent, exitVec, command.helixAxis);
                vec3.normalize(command.entryTangent, command.entryTangent);
                vec3.normalize(command.exitTangent, command.exitTangent);
                command.transform = mat4.fromValues(
                    entryVec[0], entryVec[1], entryVec[2], 0,
                    command.entryTangent[0], command.entryTangent[1], command.entryTangent[2], 0,
                    command.helixAxis[0], command.helixAxis[1], command.helixAxis[2], 0,
                    command.helixCenter[0], command.helixCenter[1], command.helixCenter[2], 1
                );
                command.helixAngle = Math.acos(vec3.dot(entryVec, exitVec));
                if(command.helixAngle == 0)
                    command.helixAngle = Math.PI*2.0;
                else if(vec3.dot(command.entryTangent, exitVec) < 0)
                    command.helixAngle = Math.PI*2.0-command.helixAngle;
                command.length = Math.hypot(command.helixRadius*command.helixAngle, command.helixExitHeight-command.helixEntryHeight);
                const aux = vec3.create();
                vec3.scale(aux, command.helixAxis, (command.helixExitHeight-command.helixEntryHeight)/command.length);
                vec3.add(command.entryTangent, command.entryTangent, aux);
                vec3.add(command.exitTangent, command.exitTangent, aux);
                vec3.normalize(command.entryTangent, command.entryTangent);
                vec3.normalize(command.exitTangent, command.exitTangent);
            } break;
            default:
                return;
        }
        // TODO: Include angularPosition in command.length calculation
        if(prevCoordinatedMotionCommand)
            prevCoordinatedMotionCommand.endFeedrate = prevCoordinatedMotionCommand.feedrate*Math.max(0.0, vec3.dot(prevCoordinatedMotionCommand.exitTangent, command.entryTangent));
        vec3.set(helixCenter, 0.0, 0.0, 0.0);
        helixRadius = 0;
        prevCoordinatedMotionCommand = command;
        commands.push(command);
    };

    for(let line of gcode.split('\n')) {
        const commentIndex = Math.max(line.indexOf(';'), line.indexOf('('));
        if(commentIndex >= 0)
            line = line.substr(0, commentIndex);
        let usedAddress = false;
        for(const command of line.split(' ')) {
            if(command.length == 0)
                continue;
            const value = parseFloat(command.substr(1));
            switch(command[0]) {
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
                    address(command.charCodeAt(0), value);
                    break;
                case 'U':
                case 'V':
                case 'W':
                    throw Error('U, V, W axes are not supported');
                case 'G':
                    codeG(value);
                    break;
                case 'M':
                    codeM(value);
                    break;
                case 'F':
                    feedrate = value*unitScale/60.0;
                    break;
                case 'P':
                    auxParameter = value;
                    break;
                case 'R':
                    usedAddress = true;
                    helixRadius = value*unitScale;
                    break;
                case 'S':
                    spindleSpeed = value/60.0;
                    if(spindleDirection)
                        commands.push({'type': 'SpindleSpeed', 'value': spindleDirection*spindleSpeed});
                break;
                default: // D E H L N O Q T
                    throw Error(`Code ${command[0]} is not supported`);
            }
        }
        if(usedAddress)
            coordinatedMotionCommand();
        auxParameter = undefined;
    }
    if(prevCoordinatedMotionCommand)
        prevCoordinatedMotionCommand.endFeedrate = 0;
    return commands;
};
