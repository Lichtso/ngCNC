#include <stdint.h>
#include "MotorDriver.h"

struct Interpolator {
    float progress, distance;
    int32_t start[AXIS_COUNT],
            end[AXIS_COUNT];
    void begin();
    bool interpolate();
};

struct LineInterpolator : public Interpolator {
    int32_t diff[AXIS_COUNT],
            error[AXIS_COUNT];
    uint8_t longestAxis;

    void begin() {
        progress = 0.0F;
        distance = 0.0F;
        for(uint8_t i = 0; i < AXIS_COUNT; ++i) {
            start[i] = stepperMotorDriver.current[i];
            diff[i] = end[i]-start[i];
            float dist = stepperMotorDriver.stepSize[i]*diff[i];
            distance += dist*dist;
            stepperMotorDriver.setDirection(i, diff[i] >= 0);
            if(diff[i] < 0)
                diff[i] *= -1;
            if(diff[i] > diff[longestAxis])
                longestAxis = i;
        }
        distance = sqrt(distance);
        for(uint8_t i = 0; i < AXIS_COUNT; ++i)
            error[i] = diff[longestAxis]/2;
    }

    void interpolate() {
        if(end[longestAxis] == stepperMotorDriver.current[longestAxis]) {
           progress = 1.0F;
           return;
        }
        progress = 1.0F-fabs(end[longestAxis]-stepperMotorDriver.current[longestAxis])/diff[longestAxis];
        for(uint8_t i = 0; i < AXIS_COUNT; ++i) {
            error[i] -= diff[i];
            if(error[i] < 0) {
                error[i] += diff[longestAxis];
                stepperMotorDriver.step(i);
            }
        }
    }
};
LineInterpolator lineInterpolator;



struct HelixInterpolator : public Interpolator {
    int32_t center[2], diff[2],
            current[AXIS_COUNT],
            radius, error;
    uint8_t axis[2], sector;

    void begin() {
        progress = 0.0F;
        distance = 0.0F; // TODO
        for(uint8_t i = 0; i < AXIS_COUNT; ++i) {
            start[i] = stepperMotorDriver.current[i];

        }

        start[axis[0]] -= center[0];
        start[axis[1]] -= center[1];
        end[axis[0]] -= center[0];
        end[axis[1]] -= center[1];
        radius = hypot(start[0], start[1]);
        diff[1] = 0;
        sector = -1;

        distance += (radius*2.0F*M_PI)*(radius*2.0F*M_PI);
        distance = sqrt(distance);
        // for(uint8_t i = 0; i < AXIS_COUNT; ++i)
        //     error[i] = diff[longestAxis]/2;
    }

    void interpolate() {
        // progress // TODO

        if(diff[1] <= 0) {
            diff[0] = 0;
            diff[1] = radius;
            error = 2-2*radius;
            // TODO: stepperMotorDriver.setDirection(i, diff[i] >= 0);
            if(++sector >= 4)
                return;
        }

        int32_t doubleError = error*2;
        if(doubleError < diff[0]*2+1)
            error += (++diff[0])*2+1;
        if(doubleError > diff[1]*-2+1)
            error += (--diff[1])*-2+1;

        current[axis[0]] = center[axis[0]];
        current[axis[1]] = center[axis[1]];
        switch(sector) {
            case 0:
                current[axis[0]] += diff[0];
                current[axis[1]] += diff[1];
                break;
            case 1:
                current[axis[0]] += diff[1];
                current[axis[1]] -= diff[0];
                break;
            case 2:
                current[axis[0]] -= diff[0];
                current[axis[1]] -= diff[1];
                break;
            case 3:
                current[axis[0]] -= diff[1];
                current[axis[1]] += diff[0];
                break;
        }
        // printf("%d %d %d\n", current[0], current[1], error);
        // if((current[0]-center[0])*start[1]-(current[1]-center[1])*start[0] >= 0 ||
        //   (current[0]-center[0])*end[1]-(current[1]-center[1])*end[0] < 0)
        //    setPixel(current[0], current[1]);
    }
};
HelixInterpolator helixInterpolator;

// TODO: Bezier
