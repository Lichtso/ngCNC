#include "FeedrateManager.h"

void LowerLimitISR();
void UpperLimitISR();

struct LimitSwitch {
    static const uint8_t dimensions = AXIS_COUNT;
    uint8_t lowerEndPin[dimensions],
            upperEndPin[dimensions];

    void setup() {
        for(uint8_t i = 0; i < dimensions; ++i) {
            pinMode(lowerEndPin[i], INPUT);
            pinMode(upperEndPin[i], INPUT);
            attachInterrupt(digitalPinToInterrupt(lowerEndPin[i]), LowerLimitISR, RISING);
            attachInterrupt(digitalPinToInterrupt(upperEndPin[i]), UpperLimitISR, RISING);
        }
    }
};
LimitSwitch limitSwitch;

void LowerLimitISR() {
    for(uint8_t i = 0; i < limitSwitch.dimensions; ++i)
        if(digitalRead(limitSwitch.lowerEndPin[i])) {
            feedrateManager.stop(); // TODO
        }
}

void UpperLimitISR() {
    for(uint8_t i = 0; i < limitSwitch.dimensions; ++i)
        if(digitalRead(limitSwitch.upperEndPin[i])) {
            feedrateManager.stop(); // TODO
        }
}
