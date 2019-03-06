#include <stdint.h>
#include "MotorDriver.h"

struct LineInterpolator {
    int32_t start[AXIS_COUNT],
            end[AXIS_COUNT],
            diff[AXIS_COUNT],
            error[AXIS_COUNT],
            stepsLeft,
            stepCount;
    uint8_t circleAxis[2];

    void begin();
    float interpolate();
};
LineInterpolator lineInterpolator;

struct CircleInterpolator {
    uint32_t radius;
    int32_t start[2],
            end[2],
            center[2],
            hand[2],
            sign[2],
            error;
    uint8_t quadrant;
    bool clockwise,
         swap;

    template<bool dryrun>
    void updateQuadrant() {
        error = 2-2*radius;
        hand[0] = radius;
        hand[1] = 0;
        sign[0] = quadrant == 0 || quadrant == 3;
        sign[1] = quadrant < 2;
        swap = quadrant&1;
        if(!dryrun) {
            stepperMotorDriver.setDirection(lineInterpolator.circleAxis[0], !sign[swap]);
            stepperMotorDriver.setDirection(lineInterpolator.circleAxis[1], sign[1-swap]^clockwise);
        }
        sign[0] = (sign[0]) ? 1 : -1;
        sign[1] = (sign[1]^clockwise) ? 1 : -1;
    }

    template<bool dryrun>
    bool step() {
        if(hand[0] <= 0) {
            if(++quadrant >= 4) {
                quadrant = 0;
                if(dryrun)
                    return false;
            }
            updateQuadrant<dryrun>();
        }
        int32_t doubleError = error*2;
        if(doubleError > hand[0]*-2+1) {
            error += (--hand[0])*-2+1;
            if(!dryrun)
                stepperMotorDriver.step(swap);
        }
        if(doubleError < hand[1]*2+1) {
            error += (++hand[1])*2+1;
            if(!dryrun)
                stepperMotorDriver.step(1-swap);
        }
        return true;
    }

    int32_t signum(int32_t value) {
        return (value == 0) ? 0 : (value < 0) ? -1 : 1;
    }

    void begin() {
        bool fullCircle = true;
        for(uint8_t i = 0; i < 2; ++i) {
            start[i] = lineInterpolator.start[lineInterpolator.circleAxis[i]]-center[i];
            end[i] = lineInterpolator.end[lineInterpolator.circleAxis[i]]-center[i];
            lineInterpolator.start[lineInterpolator.circleAxis[i]] = 0;
            lineInterpolator.end[lineInterpolator.circleAxis[i]] = 0;
            if(start[i] != end[i])
                fullCircle = false;
        }
        radius = hypot(start[0], start[1]);
        quadrant = 0;
        updateQuadrant<true>();
        int32_t position[2], storedError = error, storedHand0 = hand[0], storedHand1 = hand[1];
        int8_t storedQuadrant = quadrant;
        while(step<true>()) {
            position[0] = hand[  swap]*sign[0];
            position[1] = hand[1-swap]*sign[1];
            bool atStart = position[0] == start[0] && position[1] == start[1];
            bool isInsideDesiredArc = fullCircle;
            if(!fullCircle) {
                if(atStart)
                    isInsideDesiredArc = false;
                else if(clockwise)
                    isInsideDesiredArc |= !(position[1]*start[0]-position[0]*start[1] >= 0 &&
                                          position[0]*end[1]-position[1]*end[0] >= 0);
                else
                    isInsideDesiredArc |= position[1]*start[0]-position[0]*start[1] >= 0 &&
                                          position[0]*end[1]-position[1]*end[0] >= 0;
            }
            if(isInsideDesiredArc)
                ++lineInterpolator.end[lineInterpolator.circleAxis[0]];
            if(atStart) {
                storedError = error;
                storedQuadrant = quadrant;
                storedHand0 = hand[0];
                storedHand1 = hand[1];
            }
        }
        lineInterpolator.begin();
        quadrant = storedQuadrant;
        updateQuadrant<false>();
        error = storedError;
        hand[0] = storedHand0;
        hand[1] = storedHand1;
    }
};
CircleInterpolator circleInterpolator;

void LineInterpolator::begin() {
    stepCount = 0;
    for(uint8_t i = 0; i < AXIS_COUNT; ++i) {
        diff[i] = end[i]-start[i];
        stepperMotorDriver.setDirection(i, diff[i] >= 0);
        if(diff[i] < 0)
            diff[i] *= -1;
        if(diff[i] > stepCount)
            stepCount = diff[i];
    }
    for(uint8_t i = 0; i < AXIS_COUNT; ++i)
        error[i] = stepCount/2;
    stepsLeft = stepCount;
}

float LineInterpolator::interpolate() {
    if(stepsLeft == 0)
        return -1.0F;
    for(uint8_t i = 0; i < AXIS_COUNT; ++i) {
        error[i] -= diff[i];
        if(error[i] < 0) {
            error[i] += stepCount;
            if(i == circleAxis[0])
                circleInterpolator.step<false>();
            else
                stepperMotorDriver.step(i);
        }
    }
    return (float)(--stepsLeft)/stepCount;
}
