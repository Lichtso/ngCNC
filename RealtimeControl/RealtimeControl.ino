#include "LimitSwitch.h"

const uint8_t coolantPin = 22, illuminationPin = 24;
const float statusReportInterval = 1000000.0F/4; // 1/4 seconds

void setup() {
    pinMode(coolantPin, OUTPUT);
    pinMode(illuminationPin, OUTPUT);

    uint8_t motorDriverPins[] = { 42, 48, 37, 43, 49 };
    for(uint8_t i = 0; i < AXIS_COUNT; ++i) {
        stepperMotorDriver.stepSize[i] = 5.0/6400; // 5mm per revolution, 200*32 steps per revolution
        stepperMotorDriver.enablePin[i] = motorDriverPins[i];
        stepperMotorDriver.directionPin[i] = motorDriverPins[i]+2;
        stepperMotorDriver.stepPin[i] = motorDriverPins[i]+4;
        // stepperMotorDriver.setEnable(); // TODO
        limitSwitch.lowerEndPin[i] = 2+i*2;
        limitSwitch.upperEndPin[i] = 3+i*2;
    }
    stepperMotorDriver.stepSize[4] = 0.0; // TODO
    stepperMotorDriver.stepSize[5] = 0.0; // TODO
    stepperMotorDriver.setup();
    limitSwitch.toolLengthSensor = 30;
    limitSwitch.setup();

    spindleMotorDriver.enablePin = 34;
    spindleMotorDriver.turnPin = 36;
    spindleMotorDriver.alertPin = 38;
    spindleMotorDriver.speedPin = DAC0;
    spindleMotorDriver.directionPin = 40;
    spindleMotorDriver.maximumSpeed = 200.0F; // 200 Hz or 12000 rpm
    spindleMotorDriver.setup();

    feedrateManager.stopButtonPin = 32;
    feedrateManager.maximumAccelleration = 1.0F;
    feedrateManager.minimumFeedrate = 0.01F;
    feedrateManager.maximumFeedrate = 5.0F;
    feedrateManager.setup();

    SerialUSB.begin(115200);
    lastStatusReport = 0;
    lastLoopIteration = micros();
}

char buffer[128], *token, *tokenEnd;
uint8_t bufferIndex = 0;
bool nextToken() {
    token = tokenEnd+1;
    tokenEnd = strchr(token, ' ');
    if(!tokenEnd)
        return false;
    *tokenEnd = 0;
    return true;
}

bool parseTarget() {
    if(!nextToken())
            return false;
    sscanf(token, "%f", &feedrateManager.length);
    if(!nextToken())
            return false;
    sscanf(token, "%f", &feedrateManager.targetFeedrate);
    feedrateManager.targetFeedrate = fmax(feedrateManager.minimumFeedrate, fmin(feedrateManager.targetFeedrate, feedrateManager.maximumFeedrate));
    if(!nextToken())
            return false;
    sscanf(token, "%f", &feedrateManager.endFeedrate);
    feedrateManager.endFeedrate = fmax(feedrateManager.minimumFeedrate, fmin(feedrateManager.endFeedrate, feedrateManager.maximumFeedrate));
    for(uint8_t i = 0; i < AXIS_COUNT; ++i) {
        if(!nextToken())
            return false;
        float value;
        sscanf(token, "%f", &value);
        lineInterpolator.end[i] = value/stepperMotorDriver.stepSize[i];
    }
    return true;
}

bool parseCommand() {
    if(!nextToken())
        return false;
    if(strcmp(token, "Line") == 0) {
        if(feedrateManager.interpolator)
            return false;
        feedrateManager.interpolator = &lineInterpolator;
        feedrateManager.interpolate = (FeedrateManager::Interpolate)&LineInterpolator::interpolate;
        if(!parseTarget())
            return false;
        lineInterpolator.begin();
        feedrateManager.enterSegment();
    } else if(strcmp(token, "Helix") == 0) {
        if(feedrateManager.interpolator)
            return false;
        feedrateManager.interpolator = &helixInterpolator;
        feedrateManager.interpolate = (FeedrateManager::Interpolate)&HelixInterpolator::interpolate;
        if(!parseTarget())
            return false;
        int32_t center[3];
        for(uint8_t i = 0; i < 3; ++i) {
            if(!nextToken())
                return false;
            float value;
            sscanf(token, "%f", &value);
            center[i] = value/stepperMotorDriver.stepSize[i];
        }
        if(!nextToken())
            return false;
        if(!strlen(token) == 2)
            return false;
        switch(token[0]) {
            case '-':
                helixInterpolator.clockwise = false;
                break;
            case '+':
                helixInterpolator.clockwise = true;
                break;
            default:
                return false;
        }
        switch(token[1]) {
            case 'X':
                helixInterpolator.axis[0] = 1;
                helixInterpolator.axis[1] = 2;
                break;
            case 'Y':
                helixInterpolator.axis[0] = 0;
                helixInterpolator.axis[1] = 2;
                break;
            case 'Z':
                helixInterpolator.axis[0] = 0;
                helixInterpolator.axis[1] = 1;
                break;
            default:
                return false;
        }
        helixInterpolator.center[0] = center[helixInterpolator.axis[0]];
        helixInterpolator.center[1] = center[helixInterpolator.axis[1]];
        helixInterpolator.begin();
        feedrateManager.enterSegment();
    } else if(strcmp(token, "SoftStop") == 0)
        feedrateManager.targetFeedrate = feedrateManager.endFeedrate = 0.0F;
    else if(strcmp(token, "HardStop") == 0)
        feedrateManager.exitSegment();
    else if(strcmp(token, "SpindleSpeed") == 0) {
        if(!nextToken())
            return false;
        sscanf(token, "%f", &spindleMotorDriver.targetSpeed);
        spindleMotorDriver.setSpeed();
    } else if(strcmp(token, "MaximumAccelleration") == 0) {
        if(!nextToken())
            return false;
        sscanf(token, "%f", &feedrateManager.maximumAccelleration);
    } else if(strcmp(token, "MaximumFeedrate") == 0) {
        if(!nextToken())
            return false;
        sscanf(token, "%f", &feedrateManager.maximumFeedrate);
    } else if(strcmp(token, "Coolant") == 0) {
        if(!nextToken())
            return false;
        if(strcmp(token, "ON") == 0)
            digitalWrite(coolantPin, HIGH);
        else if(strcmp(token, "OFF") == 0)
            digitalWrite(coolantPin, LOW);
        else
            return false;
    } else if(strcmp(token, "Illumination") == 0) {
        if(!nextToken())
            return false;
        if(strcmp(token, "ON") == 0)
            digitalWrite(illuminationPin, HIGH);
        else if(strcmp(token, "OFF") == 0)
            digitalWrite(illuminationPin, LOW);
        else
            return false;
    } else
        return false;
    return true;
}

void loop() {
    uint32_t currentLoopIteration = micros();
    float seconds = (currentLoopIteration-lastLoopIteration)/1000000.0;
    lastLoopIteration = currentLoopIteration;

    while(SerialUSB.available() > 0) {
        buffer[bufferIndex++] = SerialUSB.read();
        if(buffer[bufferIndex-1] == '\n') {
            buffer[bufferIndex-1] = ' ';
            buffer[bufferIndex] = 0;
            bufferIndex = 0;
            tokenEnd = buffer-1;
            if(!parseCommand())
                sendError("Invalid Command");
        }
    }

    spindleMotorDriver.loop();
    feedrateManager.loop(seconds);

    if(currentLoopIteration-lastStatusReport > statusReportInterval) {
        lastStatusReport = floor(currentLoopIteration/statusReportInterval)*statusReportInterval;
        SerialUSB.print("Status ");
        SerialUSB.print(currentLoopIteration/1000000.0);
        SerialUSB.print(' ');
        for(uint8_t i = 0; i < AXIS_COUNT; ++i) {
            SerialUSB.print(stepperMotorDriver.current[i]*stepperMotorDriver.stepSize[i], 4);
            SerialUSB.print(' ');
        }
        SerialUSB.print(feedrateManager.progressLeft);
        SerialUSB.print(' ');
        SerialUSB.print(feedrateManager.currentFeedrate);
        SerialUSB.print(' ');
        SerialUSB.println(spindleMotorDriver.currentSpeed);
    }
}
