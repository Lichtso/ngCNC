#include "Interpolation.h"

void ButtonPressedISR();

struct FeedrateManager {
    typedef void (Interpolator::*Interpolate)();
    Interpolator* interpolator;
    Interpolate interpolate;
    uint8_t buttonPin;
    float maximumAccelleration,
          minimumFeedrate,
          maximumFeedrate,
          targetFeedrate,
          endFeedrate,
          currentFeedrate;

    void setup() {
        interpolator = &lineInterpolator;
        pinMode(buttonPin, INPUT);
        attachInterrupt(digitalPinToInterrupt(buttonPin), ButtonPressedISR, RISING);
    }

    void loop(uint32_t currentLoopIteration, float seconds) {
        if(!interpolator)
            return;
        float slowDownTime = (targetFeedrate-endFeedrate)/maximumAccelleration,
              slowDownDistance = (currentFeedrate-maximumAccelleration*slowDownTime*0.5)*slowDownTime;
        if(slowDownTime > 0.0F && (1.0F-interpolator->progress)*interpolator->distance <= slowDownDistance)
            targetFeedrate = endFeedrate;
        if(currentFeedrate != targetFeedrate) {
            float accelleration = fmax(-maximumAccelleration*seconds, fmin(targetFeedrate-currentFeedrate, maximumAccelleration*seconds));
            currentFeedrate = fmax(minimumFeedrate, currentFeedrate+accelleration);
        }
        (interpolator->*interpolate)();
        uint32_t microseconds = sqrt(stepperMotorDriver.stepAccumulator)/currentFeedrate*1000000.0F,
                 risingTime = micros(),
                 overdue = risingTime-currentLoopIteration;
        if(overdue < microseconds)
            microseconds -= overdue;
        microseconds /= 2;
        delayMicroseconds(microseconds);
        if(interpolator->progress < 1.0F) {
            stepperMotorDriver.resetStepSignals();
            overdue = micros()-risingTime-microseconds;
            if(overdue < microseconds)
                microseconds -= overdue;
            delayMicroseconds(microseconds);
        } else
            stop();
    }

    void stop() {
        targetFeedrate = currentFeedrate = 0.0F;
        interpolator = NULL;
        interpolate = NULL;
        stepperMotorDriver.resetStepSignals();
    }
};
FeedrateManager feedrateManager;

void ButtonPressedISR() {
    feedrateManager.stop();
}
