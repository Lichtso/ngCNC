#include "Interpolation.h"

void StopButtonISR();

struct FeedrateManager {
    typedef void (Interpolator::*Interpolate)();
    Interpolator* interpolator;
    Interpolate interpolate;
    uint8_t stopButtonPin;
    float maximumAccelleration,
          minimumFeedrate,
          maximumFeedrate,
          targetFeedrate,
          endFeedrate,
          currentFeedrate;

    void setup() {
        pinMode(stopButtonPin, INPUT);
        attachInterrupt(digitalPinToInterrupt(stopButtonPin), StopButtonISR, RISING);
        NVIC_EnableIRQ(TC3_IRQn);
        pmc_set_writeprotect(false);
        pmc_enable_periph_clk(TC3_IRQn);
        TC_Configure(TC1, 0, TC_CMR_WAVE | TC_CMR_WAVSEL_UP_RC | TC_CMR_TCCLKS_TIMER_CLOCK4);
        TC1->TC_CHANNEL[0].TC_IER = TC_IER_CPCS;
    }

    void loop(float seconds) {
        if(!interpolator)
            return;
        NVIC_DisableIRQ(TC3_IRQn);
        float slowDownTime = (targetFeedrate-endFeedrate)/maximumAccelleration,
              slowDownDistance = (currentFeedrate-maximumAccelleration*slowDownTime*0.5)*slowDownTime,
              distanceLeft = (1.0F-interpolator->progress)*interpolator->distance;
        if(slowDownTime > 0.0F && distanceLeft <= slowDownDistance)
            targetFeedrate = distanceLeft/slowDownTime;
        if(currentFeedrate != targetFeedrate) {
            float accelleration = fmax(-maximumAccelleration*seconds, fmin(targetFeedrate-currentFeedrate, maximumAccelleration*seconds));
            currentFeedrate = currentFeedrate+accelleration;
        }
        NVIC_EnableIRQ(TC3_IRQn);
    }

    void intervalHandler() {
        (interpolator->*interpolate)();
        TC_SetRC(TC1, 0, sqrt(stepperMotorDriver.stepAccumulator)/fmax(minimumFeedrate, currentFeedrate)*(VARIANT_MCK/128)); // TC_CMR_TCCLKS_TIMER_CLOCK4 = 128
        if(interpolator->progress == 1.0F || (targetFeedrate == 0.0F && currentFeedrate == 0.0F))
            exitSegment();
        else
            stepperMotorDriver.resetStepSignals();
    }

    void enterSegment() {
        intervalHandler();
        TC_Start(TC1, 0);
    }

    void exitSegment() {
        TC_Stop(TC1, 0);
        interpolator = NULL;
        interpolate = NULL;
        targetFeedrate = endFeedrate = 0.0F;
        stepperMotorDriver.resetStepSignals();
        lastStatusReport = 0;
    }
};
FeedrateManager feedrateManager;

void StopButtonISR() {
    emergencyStop();
    SerialUSB.println("ERROR: Emergency Stop - Button");
}

void TC3_Handler() {
    feedrateManager.intervalHandler();
    TC_GetStatus(TC1, 0);
}



void emergencyStop() {
    feedrateManager.exitSegment();
}

void statusReport() {
    SerialUSB.print(lastLoopIteration/1000000.0);
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
