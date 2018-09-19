#include "Interpolation.h"

uint32_t lastLoopIteration, lastStatusReport;
void statusReport();
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
        pinMode(buttonPin, INPUT);
        attachInterrupt(digitalPinToInterrupt(buttonPin), ButtonPressedISR, RISING);
        NVIC_EnableIRQ(TC3_IRQn);
        pmc_set_writeprotect(false);
        pmc_enable_periph_clk(TC3_IRQn);
        TC_Configure(TC1, 0, TC_CMR_WAVE | TC_CMR_WAVSEL_UP_RC | TC_CMR_TCCLKS_TIMER_CLOCK4);
        TC1->TC_CHANNEL[0].TC_IER = TC_IER_CPCS;
    }

    void loop(float seconds) {
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
    }

    void intervalHandler() {
        (interpolator->*interpolate)();
        TC_SetRC(TC1, 0, sqrt(stepperMotorDriver.stepAccumulator)/currentFeedrate*(VARIANT_MCK/128)); // TC_CMR_TCCLKS_TIMER_CLOCK4 = 128
        stepperMotorDriver.resetStepSignals();
        if(interpolator->progress == 1.0F)
            exitSegment();
    }

    void enterSegment() {
        currentFeedrate = minimumFeedrate;
        intervalHandler();
        TC_Start(TC1, 0);
    }

    void exitSegment() {
        TC_Stop(TC1, 0);
        targetFeedrate = endFeedrate = currentFeedrate = 0.0F;
        interpolator = NULL;
        interpolate = NULL;
        stepperMotorDriver.resetStepSignals();
        statusReport();
    }

    void stop() {
        SerialUSB.println("STOP triggered");
        exitSegment();
    }
};
FeedrateManager feedrateManager;

void statusReport() {
    lastStatusReport = micros();
    SerialUSB.print(lastStatusReport/1000000.0);
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

void ButtonPressedISR() {
    feedrateManager.stop();
}

void TC3_Handler() {
    NVIC_DisableIRQ(TC3_IRQn);
    TC_GetStatus(TC1, 0);
    feedrateManager.intervalHandler();
    NVIC_EnableIRQ(TC3_IRQn);
}
