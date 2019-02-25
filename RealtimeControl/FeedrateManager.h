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
    uint8_t stopButtonPin,
            statusLedPin;
    bool active;

    void setup() {
        pinMode(stopButtonPin, INPUT_PULLUP);
        pinMode(statusLedPin, OUTPUT);
        attachInterrupt(digitalPinToInterrupt(stopButtonPin), StopButtonISR, FALLING);
        NVIC_EnableIRQ(TC3_IRQn);
        pmc_set_writeprotect(false);
        pmc_enable_periph_clk(TC3_IRQn);
        TC_Configure(TC1, 0, TC_CMR_WAVE | TC_CMR_WAVSEL_UP_RC | TC_CMR_TCCLKS_TIMER_CLOCK4);
        TC1->TC_CHANNEL[0].TC_IER = TC_IER_CPCS;
    }

    void loop(float seconds) {
        if(!active) {
            float value = fmod(lastLoopIteration/1000000.0, 2.0);
            analogWrite(statusLedPin, ((value < 1.0) ? value : 2.0-value)*4095);
            return;
        }
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

    void stepAndSetTimeInterval() {
        progressLeft = lineInterpolator.interpolate();
        TC_SetRC(TC1, 0, sqrt(stepperMotorDriver.stepAccumulator)/fmax(minimumFeedrate, currentFeedrate)*(VARIANT_MCK/128)); // TC_CMR_TCCLKS_TIMER_CLOCK4 = 128
    }

    void enterSegment() {
        active = true;
        digitalWrite(statusLedPin, HIGH);
        stepAndSetTimeInterval();
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
    feedrateManager.stepAndSetTimeInterval();
    if(feedrateManager.progressLeft == -1.0F || (feedrateManager.targetFeedrate == 0.0F && feedrateManager.currentFeedrate == 0.0F))
        feedrateManager.exitSegment();
    else
        stepperMotorDriver.resetStepSignals();
    TC_GetStatus(TC1, 0);
}



void emergencyStop() {
    feedrateManager.exitSegment();
}
