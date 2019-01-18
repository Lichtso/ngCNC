#include "FeedrateManager.h"

void LowerLimitISR();
void UpperLimitISR();
void ToolLengthSensorISR();

struct LimitSwitch {
    static const uint8_t dimensions = AXIS_COUNT;
    uint8_t lowerEndPin[dimensions],
            upperEndPin[dimensions],
            toolLengthSensor;

    void setup() {
        for(uint8_t i = 0; i < dimensions; ++i) {
            pinMode(lowerEndPin[i], INPUT);
            attachInterrupt(digitalPinToInterrupt(lowerEndPin[i]), LowerLimitISR, RISING);
            pinMode(upperEndPin[i], INPUT);
            attachInterrupt(digitalPinToInterrupt(upperEndPin[i]), UpperLimitISR, RISING);
        }
        pinMode(toolLengthSensor, INPUT);
        attachInterrupt(digitalPinToInterrupt(toolLengthSensor), ToolLengthSensorISR, RISING);
    }

    // TODO: Homing
};
LimitSwitch limitSwitch;

void LowerLimitISR() {
    for(uint8_t i = 0; i < limitSwitch.dimensions; ++i)
        if(digitalRead(limitSwitch.lowerEndPin[i])) {
            emergencyStop();
            sendError("Emergency Stop - Limit Switch");
        }
}

void UpperLimitISR() {
    for(uint8_t i = 0; i < limitSwitch.dimensions; ++i)
        if(digitalRead(limitSwitch.upperEndPin[i])) {
            emergencyStop();
            sendError("Emergency Stop - Limit Switch");
        }
}

void ToolLengthSensorISR() {
    emergencyStop();
    sendError("Emergency Stop - Tool Length Sensor");
}
