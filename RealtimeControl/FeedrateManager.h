#include "Interpolation.h"

void StopButtonISR();

struct FeedrateManager {
    float maximumAccelleration,
          minimumFeedrate,
          maximumFeedrate,
          targetFeedrate,
          endFeedrate,
          currentFeedrate,
          progressLeft,
          length;
    uint8_t stopButtonPin;
    bool active;

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
        if(!active)
            return;
        // NVIC_DisableIRQ(TC3_IRQn);
        float slowDownTime = (currentFeedrate-endFeedrate)/maximumAccelleration,
              slowDownDistance = (currentFeedrate-maximumAccelleration*slowDownTime*0.5)*slowDownTime,
              distanceLeft = progressLeft*length;
        if(slowDownTime > 0.0F && distanceLeft <= slowDownDistance)
            targetFeedrate = endFeedrate+distanceLeft/slowDownTime;
        if(currentFeedrate != targetFeedrate) {
            float accelleration = fmax(-maximumAccelleration*seconds, fmin(targetFeedrate-currentFeedrate, maximumAccelleration*seconds));
            currentFeedrate = currentFeedrate+accelleration;
        }
        // NVIC_EnableIRQ(TC3_IRQn);
    }

    void intervalHandler() {
        progressLeft = lineInterpolator.interpolate();
        TC_SetRC(TC1, 0, sqrt(stepperMotorDriver.stepAccumulator)/fmax(minimumFeedrate, currentFeedrate)*(VARIANT_MCK/128)); // TC_CMR_TCCLKS_TIMER_CLOCK4 = 128
        if(progressLeft == 0.0F || (targetFeedrate == 0.0F && currentFeedrate == 0.0F))
            exitSegment();
        else
            stepperMotorDriver.resetStepSignals();
    }

    void enterSegment() {
        active = true;
        intervalHandler();
        TC_Start(TC1, 0);
    }

    void exitSegment() {
        TC_Stop(TC1, 0);
        active = false;
        targetFeedrate = endFeedrate = 0.0F;
        stepperMotorDriver.resetStepSignals();
        lastStatusReport = 0;
    }
};
FeedrateManager feedrateManager;

void StopButtonISR() {
    emergencyStop();
    sendError("Emergency Stop - Button");
}

void TC3_Handler() {
    feedrateManager.intervalHandler();
    TC_GetStatus(TC1, 0);
}



void emergencyStop() {
    feedrateManager.exitSegment();
}
