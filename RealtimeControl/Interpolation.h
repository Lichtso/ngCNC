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
            diff[2],
            radius,
            error;
    uint8_t axis[2], sector;
    bool clockwise;

    void begin() {
        int32_t end[2] = {lineInterpolator.end[axis[0]]-center[0], lineInterpolator.end[axis[0]]-center[1]};
        lineInterpolator.end[axis[0]] = stepperMotorDriver.current[axis[0]];
        lineInterpolator.end[axis[1]] = stepperMotorDriver.current[axis[1]];
        lineInterpolator.begin();
        lineInterpolator.end[axis[0]] = end[0];
        lineInterpolator.end[axis[1]] = end[1];
        lineInterpolator.start[axis[0]] -= center[0];
        lineInterpolator.start[axis[1]] -= center[1];
        radius = hypot(lineInterpolator.start[0], lineInterpolator.start[1]);
        diff[1] = 0;
        sector = -1;
        // for(uint8_t i = 0; i < AXIS_COUNT; ++i)
        //     error[i] = diff[longestAxis]/2;
    }

    float interpolate() {
        if(diff[1] <= 0) {
            diff[0] = 0;
            diff[1] = radius;
            error = 2-2*radius;
            // TODO: stepperMotorDriver.setDirection(i, diff[i] >= 0);
            if(++sector >= 4)
                return 0.0F;
        }

        int32_t doubleError = error*2;
        if(doubleError < diff[0]*2+1)
            error += (++diff[0])*2+1;
        if(doubleError > diff[1]*-2+1)
            error += (--diff[1])*-2+1;

        int32_t sign[2]; // TODO: clockwise / mirrored
        sign[0] = (sector >= 2) ? -1 : 1;
        sign[1] = (sector == 1 || sector == 2) ? -1 : 1;

        int32_t currentPos[2];
        currentPos[axis[0]] = center[axis[0]]+sign[0]*diff[0];
        currentPos[axis[1]] = center[axis[1]]+sign[1]*diff[1];
        // lineInterpolator.interpolate();

        // printf("%d %d %d\n", current[0], current[1], error);
        // if((current[0]-center[0])*start[1]-(current[1]-center[1])*start[0] >= 0 ||
        //   (current[0]-center[0])*end[1]-(current[1]-center[1])*end[0] < 0)
        //    setPixel(current[0], current[1]);

        return 1.0F; // TODO: Progress / distance left
    }
};
HelixInterpolator helixInterpolator;

// TODO: Bezier
