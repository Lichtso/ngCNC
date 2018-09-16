#include "FeedrateManager.h"

const uint8_t coolantPin = 44, illuminationPin = 45;
const uint32_t statusReportInterval = 1000000*0.25F;
uint32_t lastLoopIteration, lastStatusReport;

void setup() {
    // REG_PIOx_OWER, REG_PIOx_OWDR
    // REG_PIOx_ODSR, REG_PIOx_SODR, REG_PIOx_CODR
    pinMode(coolantPin, OUTPUT);
    pinMode(illuminationPin, OUTPUT);

    uint8_t motorDriverPins[] = { 22, 23, 28, 29, 34 };
    for(uint8_t i = 0; i < AXIS_COUNT; ++i) {
        stepperMotorDriver.stepSize[i] = 5.0/6400; // 5mm per revolution, 200*32 steps per revolution
        stepperMotorDriver.enablePin[i] = motorDriverPins[i];
        stepperMotorDriver.directionPin[i] = motorDriverPins[i]+2;
        stepperMotorDriver.stepPin[i] = motorDriverPins[i]+4;
        limitSwitch.lowerEndPin[i] = 2+i*2;
        limitSwitch.upperEndPin[i] = 3+i*2;
    }
    stepperMotorDriver.setup();
    limitSwitch.setup();

    spindleMotorDriver.enablePin = 35;
    spindleMotorDriver.directionPin = 37;
    spindleMotorDriver.turnPin = 39;
    spindleMotorDriver.alertPin = 41;
    spindleMotorDriver.speedPin = DAC0;
    spindleMotorDriver.maximumSpeed = 200.0F; // 200 Hz or 12000 rpm
    spindleMotorDriver.setup();

    feedrateManager.buttonPin = 43;
    feedrateManager.maximumAccelleration = 1.0F;
    feedrateManager.minimumFeedrate = 0.1F;
    feedrateManager.maximumFeedrate = 5.0F;
    feedrateManager.setup();

    SerialUSB.begin(115200);
    lastLoopIteration = lastStatusReport = micros();
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
        feedrateManager.interpolator->end[i] = value/stepperMotorDriver.stepSize[i];
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
    } else if(strcmp(token, "Helix") == 0) {
        if(feedrateManager.interpolator)
            return false;
        feedrateManager.interpolator = &helixInterpolator;
        feedrateManager.interpolate = (FeedrateManager::Interpolate)&HelixInterpolator::interpolate;
        if(!parseTarget())
            return false;
        // TODO: helixInterpolator.axis[], helixInterpolator.center[]
        helixInterpolator.begin();
    } else if(strcmp(token, "Stop") == 0)
        feedrateManager.stop();
    else if(strcmp(token, "Spindle") == 0) {
        if(!nextToken())
            return false;
        if(strcmp(token, "CW") == 0) {
            spindleMotorDriver.setDirection(false);
            spindleMotorDriver.setEnable(true);
        } else if(strcmp(token, "CCW") == 0) {
            spindleMotorDriver.setDirection(true);
            spindleMotorDriver.setEnable(true);
        } else if(strcmp(token, "OFF") == 0)
            spindleMotorDriver.setEnable(false);
        else
            return false;
    } else if(strcmp(token, "SpindleSpeed") == 0) {
        if(!nextToken())
            return false;
        sscanf(token, "%f", &spindleMotorDriver.targetSpeed);
        spindleMotorDriver.setSpeed();
    } else if(strcmp(token, "Coolant") == 0) {
        if(!nextToken())
            return false;
        if(strcmp(token, "ON") == 0) {
            digitalWrite(coolantPin, HIGH);
        } else if(strcmp(token, "OFF") == 0) {
            digitalWrite(coolantPin, LOW);
        } else
            return false;
    } else if(strcmp(token, "Illumination") == 0) {
        if(!nextToken())
            return false;
        if(strcmp(token, "ON") == 0) {
            digitalWrite(illuminationPin, HIGH);
        } else if(strcmp(token, "OFF") == 0) {
            digitalWrite(illuminationPin, LOW);
        } else
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
                SerialUSB.println("ERROR: Invalid Command");
        }
    }

    spindleMotorDriver.loop(currentLoopIteration);
    feedrateManager.loop(currentLoopIteration, seconds);

    if(currentLoopIteration-lastStatusReport > statusReportInterval) {
      lastStatusReport = currentLoopIteration;
      SerialUSB.print(currentLoopIteration/1000000.0);
      SerialUSB.print(' ');
      for(uint8_t i = 0; i < AXIS_COUNT; ++i) {
        SerialUSB.print(stepperMotorDriver.current[i]);
        SerialUSB.print(' ');
      }
      SerialUSB.print(feedrateManager.interpolator->progress);
      SerialUSB.print(' ');
      SerialUSB.print(feedrateManager.currentFeedrate);
      SerialUSB.print(' ');
      SerialUSB.println(spindleMotorDriver.speed);
    }
}
