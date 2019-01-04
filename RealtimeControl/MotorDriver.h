#include <Arduino.h>

#define AXIS_COUNT 5
uint32_t lastLoopIteration, lastStatusReport;
void emergencyStop();
void sendError(const char* message) {
    SerialUSB.print("Error ");
    SerialUSB.print(micros()/1000000.0);
    SerialUSB.print(' ');
    SerialUSB.println(message);
}


struct StepperMotorDriver {
    static const uint8_t dimensions = AXIS_COUNT;
    bool direction[dimensions];
    float stepSize[dimensions], stepAccumulator;
    int32_t current[dimensions];
    uint8_t enablePin[dimensions],
            directionPin[dimensions],
            stepPin[dimensions];

    void setup() {
        for(uint8_t i = 0; i < dimensions; ++i) {
            pinMode(enablePin[i], OUTPUT);
            pinMode(directionPin[i], OUTPUT);
            pinMode(stepPin[i], OUTPUT);
        }
        resetStepSignals();
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
        stepAccumulator += stepSize[i]*stepSize[i]; // TODO: Correct stepSize of angular movement
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
void AlertISR() {
    emergencyStop();
    sendError("Emergency Stop - Spindle Motor");
}

struct SpindleMotorDriver {
    uint8_t enablePin, turnPin, alertPin, speedPin, directionPin;
    volatile uint32_t prevTurn, currentTurn;
    uint16_t voltage;
    float currentSpeed, targetSpeed, maximumSpeed;

    void setup() {
        pinMode(enablePin, OUTPUT);
        pinMode(turnPin, INPUT);
        pinMode(alertPin, INPUT);
        pinMode(speedPin, OUTPUT);
        pinMode(directionPin, OUTPUT);
        analogWriteResolution(12);
        attachInterrupt(digitalPinToInterrupt(turnPin), TurnISR, RISING);
        attachInterrupt(digitalPinToInterrupt(alertPin), AlertISR, RISING);
        prevTurn = currentTurn = micros();
    }

    void setSpeed() {
        voltage = fmax(0.0F, fmin((fabs(targetSpeed)/maximumSpeed-0.05F)*0.84F, 1.0F))*4095;
        analogWrite(DAC0, voltage);
        digitalWrite(directionPin, targetSpeed > 0.0);
        digitalWrite(enablePin, targetSpeed != 0.0);
    }

    void loop() {
        currentSpeed = (currentTurn-prevTurn < 1000) ? 0.0F : 1000000.0F/(currentTurn-prevTurn);
        prevTurn = currentTurn = lastLoopIteration;
        // TODO: Speed control
    }
};
SpindleMotorDriver spindleMotorDriver;

void TurnISR() {
    spindleMotorDriver.prevTurn = spindleMotorDriver.currentTurn;
    spindleMotorDriver.currentTurn = micros();
}
