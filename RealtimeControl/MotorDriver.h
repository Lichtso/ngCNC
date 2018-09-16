#include <Arduino.h>
#define AXIS_COUNT 5

struct StepperMotorDriver {
    static const uint8_t dimensions = AXIS_COUNT;
    bool direction[dimensions];
    float stepSize[dimensions], stepAccumulator;
    int32_t current[dimensions];
    uint8_t enablePin[dimensions],
            directionPin[dimensions],
            stepPin[dimensions];

    void setup() {
        stepAccumulator = 0;
        for(uint8_t i = 0; i < dimensions; ++i) {
            pinMode(enablePin[i], OUTPUT);
            pinMode(directionPin[i], OUTPUT);
            pinMode(stepPin[i], OUTPUT);
        }
    }

    void setEnable(bool enabled) {
        for(uint8_t i = 0; i < dimensions; ++i)
            digitalWrite(enablePin[i], enabled);
    }

    void setDirection(uint8_t i, bool forward) {
        direction[i] = forward;
        digitalWrite(directionPin[i], forward);
    }

    void step(uint8_t i) {
        stepAccumulator += stepSize[i]*stepSize[i];
        digitalWrite(stepPin[i], HIGH);
        if(direction[i])
            ++current[i];
        else
            --current[i];
    }

    void resetStepSignals() {
        stepAccumulator = 0;
        for(uint8_t i = 0; i < dimensions; ++i)
            digitalWrite(stepPin[i], LOW);
    }
};
StepperMotorDriver stepperMotorDriver;



void TurnISR();
void AlertISR();

struct SpindleMotorDriver {
    uint8_t enablePin, directionPin, turnPin, alertPin, speedPin;
    volatile uint32_t prevTurn, currentTurn;
    uint16_t voltage;
    float speed, targetSpeed, maximumSpeed;

    void setup() {
        setEnable(false);
        pinMode(enablePin, OUTPUT);
        pinMode(directionPin, OUTPUT);
        pinMode(turnPin, INPUT);
        pinMode(alertPin, INPUT);
        pinMode(speedPin, OUTPUT);
        analogWriteResolution(12);
        attachInterrupt(digitalPinToInterrupt(turnPin), TurnISR, RISING);
        attachInterrupt(digitalPinToInterrupt(alertPin), AlertISR, RISING);
        prevTurn = currentTurn = micros();
    }

    void setSpeed() {
        voltage = fmax(0.0F, fmin((targetSpeed/maximumSpeed-0.05F)*0.84F, 1.0F))*4095;
        analogWrite(DAC0, voltage);
    }

    void setDirection(bool direction) {
        digitalWrite(directionPin, direction);
    }

    void setEnable(bool enable) {
        digitalWrite(enablePin, !enable);
    }

    void loop(uint32_t currentLoopIteration) {
        speed = (currentTurn-prevTurn < 1000) ? 0.0F : 1000000.0F/(currentTurn-prevTurn);
        prevTurn = currentTurn = currentLoopIteration;
        // TODO: Speed control
    }
};
SpindleMotorDriver spindleMotorDriver;

void TurnISR() {
    spindleMotorDriver.prevTurn = spindleMotorDriver.currentTurn;
    spindleMotorDriver.currentTurn = micros();
}

void AlertISR() {
    // TODO
}
