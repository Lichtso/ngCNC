#include <stdint.h>
#include "MotorDriver.h"

struct Interpolator {
    void begin();
    float interpolate();
};

struct LineInterpolator : public Interpolator {
    int32_t start[AXIS_COUNT],
            end[AXIS_COUNT],
            diff[AXIS_COUNT],
            error[AXIS_COUNT];
    uint8_t longestAxis;

    void begin() {
        for(uint8_t i = 0; i < AXIS_COUNT; ++i) {
            start[i] = stepperMotorDriver.current[i];
            diff[i] = end[i]-start[i];
            stepperMotorDriver.setDirection(i, diff[i] >= 0);
            if(diff[i] < 0)
                diff[i] *= -1;
            if(diff[i] > diff[longestAxis])
                longestAxis = i;
        }
        for(uint8_t i = 0; i < AXIS_COUNT; ++i)
            error[i] = diff[longestAxis]/2;
    }

    float interpolate() {
        if(end[longestAxis] == stepperMotorDriver.current[longestAxis])
           return 0.0F;
        for(uint8_t i = 0; i < AXIS_COUNT; ++i) {
            error[i] -= diff[i];
            if(error[i] < 0) {
                error[i] += diff[longestAxis];
                stepperMotorDriver.step(i);
            }
        }
        return fabs(end[longestAxis]-stepperMotorDriver.current[longestAxis])/diff[longestAxis];
    }
};
LineInterpolator lineInterpolator;



struct HelixInterpolator : public Interpolator {
    int32_t center[2],
            hand[2],
            sign[2],
            error;
    uint32_t radius;
    uint8_t axis[2],
            sector;
    bool clockwise,
         swap;

    void begin() {
        int32_t end[2] = {lineInterpolator.end[axis[0]]-center[0], lineInterpolator.end[axis[1]]-center[1]};
        lineInterpolator.end[axis[0]] = stepperMotorDriver.current[axis[0]];
        lineInterpolator.end[axis[1]] = stepperMotorDriver.current[axis[1]];
        lineInterpolator.begin();
        lineInterpolator.end[axis[0]] = end[0];
        lineInterpolator.start[axis[0]] -= center[0];
        lineInterpolator.end[axis[1]] = end[1];
        lineInterpolator.start[axis[1]] -= center[1];
        radius = hypot(lineInterpolator.start[axis[0]], lineInterpolator.start[axis[1]]);
        sector = -1;
        hand[1] = 0;
        while(interpolate<true>() > 0.0F);
    }

    template<bool dryrun = false>
    float interpolate() {
        if(hand[0] <= 0) {
            if(++sector >= 4) {
                sector = -1;
                return 0.0F;
            }
            hand[0] = radius;
            hand[1] = 0;
            error = 2-2*radius;
            swap = sector&1;
            sign[0] = sector == 0 || sector == 3;
            sign[1] = sector < 2;
            if(!dryrun) {
                stepperMotorDriver.setDirection(axis[0], !sign[swap]);
                stepperMotorDriver.setDirection(axis[1], sign[1-swap]^clockwise);
            }
            sign[0] = (sign[0]) ? 1 : -1;
            sign[1] = (sign[1]^clockwise) ? 1 : -1;
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

        return 1.0F; // TODO: Invoke lineInterpolator.interpolate();
    }
};
HelixInterpolator helixInterpolator;

// TODO: Bezier
