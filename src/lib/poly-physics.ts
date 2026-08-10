// Poly Racer arcade car physics.
//
// Deliberately free of three.js and React so the same integrator that the
// runner uses can be driven headlessly in tests. Fixed-step: call
// stepCar() at STEP seconds, never with a variable dt.
import { TERRAIN_Y, type Sampler, type Surface } from "./polytrack-engine";

/** Fixed simulation step, in seconds. */
export const STEP = 1 / 120;

export const MAX_SPEED = 46;      // world units/s on tarmac
export const ENGINE = 34;         // forward acceleration
export const REVERSE = 16;
export const BRAKE = 60;
export const ROLL_DRAG = 0.5;     // linear rolling resistance
export const AIR_DRAG = 0.0016;   // quadratic
export const GRIP = 9;            // lateral velocity bleed-off, per second
export const DRIFT_GRIP = 2.2;
export const OFF_GRIP = 4.5;
export const OFF_DRAG = 3.4;      // grass is slow
export const OFF_MAX = 20;
export const TURN_RATE = 2.4;     // rad/s at the sweet spot
export const AIR_TURN = 0.9;
export const GRAVITY = 34;
export const BOOST_MAX = 66;
export const BOOST_ACCEL = 55;
/** What the speedo reads at full pelt on tarmac. */
export const TOP_SPEED_KMH = 100;
/**
 * World units/s → the number shown on the speedo.
 *
 * Derived from MAX_SPEED rather than written as a literal, so the two
 * cannot drift apart: retune the car's top speed and the dial still
 * reads TOP_SPEED_KMH at the top of it. Boost briefly goes past this,
 * which is the point of a boost.
 */
export const SPEED_TO_KMH = TOP_SPEED_KMH / MAX_SPEED;

export type CarState = {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  yaw: number;
  /** Smoothed steering input, -1..1. */
  steer: number;
  grounded: boolean;
  /** Visual-only: wheel rotation and body attitude. */
  wheelSpin: number;
  pitch: number;
  roll: number;
};

export type CarInput = {
  /** 1 = accelerate, -1 = brake/reverse. */
  throttle: number;
  /** 1 = left, -1 = right. */
  steer: number;
  drift: boolean;
};

export type StepResult = {
  /** Surface under the car after the step. */
  surface: Surface;
  onRoad: boolean;
  /** Horizontal speed, world units/s. */
  speed: number;
  /** True on the frame the car touched down after being airborne. */
  landed: boolean;
  /** True when the car was stopped by the side of a raised piece. */
  walled: boolean;
};

export function createCar(x: number, y: number, z: number, yaw: number): CarState {
  return { x, y, z, vx: 0, vy: 0, vz: 0, yaw, steer: 0, grounded: true, wheelSpin: 0, pitch: 0, roll: 0 };
}

export function resetCar(car: CarState, x: number, y: number, z: number, yaw: number): void {
  car.x = x; car.y = y; car.z = z; car.yaw = yaw;
  car.vx = 0; car.vy = 0; car.vz = 0;
  car.steer = 0; car.pitch = 0; car.roll = 0;
  car.grounded = true;
}

/**
 * Advance the car by one fixed step. Grip is split into a forward and a
 * lateral component in the car's own frame, which is what gives the
 * handbrake its slide and the tyres their bite.
 */
export function stepCar(car: CarState, input: CarInput, dt: number, sampler: Sampler): StepResult {
  const surf = sampler.at(car.x, car.z, car.y);
  const onRoad = surf.onRoad;

  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
  // right = forward × up in a right-handed, Y-up world.
  const rx = -fz, rz = fx;
  let vf = car.vx * fx + car.vz * fz;
  let vl = car.vx * rx + car.vz * rz;

  // Steering eases in rather than snapping to full lock, so a tap is a
  // nudge and holding the key is what gets you round a hairpin.
  car.steer += (input.steer - car.steer) * Math.min(1, dt * 10);

  if (car.grounded) {
    // Steering bites once rolling and calms down at speed.
    const sp = Math.abs(vf);
    const bite = Math.min(1, sp / 6) * (1 - 0.45 * Math.min(1, sp / MAX_SPEED));
    const dir = vf < -0.5 ? -1 : 1;
    car.yaw += car.steer * TURN_RATE * bite * (input.drift ? 1.4 : 1) * dir * dt;
  } else {
    car.yaw += car.steer * AIR_TURN * dt;
  }

  if (car.grounded) {
    const maxSpeed = onRoad ? MAX_SPEED : OFF_MAX;
    if (input.throttle > 0) {
      const headroom = Math.max(0, 1 - Math.max(0, vf) / maxSpeed);
      vf += ENGINE * headroom * dt;
    } else if (input.throttle < 0) {
      vf -= (vf > 0.5 ? BRAKE : REVERSE) * dt;
    }
    if (input.drift) vf -= vf * 0.9 * dt;
    if (onRoad && surf.tile?.type === "boost") {
      vf = Math.min(BOOST_MAX, vf + BOOST_ACCEL * dt);
    }

    vf -= vf * (onRoad ? ROLL_DRAG : OFF_DRAG) * dt;
    vf -= Math.sign(vf) * AIR_DRAG * vf * vf * dt;
    // Gravity fights you uphill and helps you down.
    const slope = onRoad ? surf.gx * fx + surf.gz * fz : 0;
    vf -= GRAVITY * slope * dt;

    const grip = input.drift ? DRIFT_GRIP : onRoad ? GRIP : OFF_GRIP;
    vl *= Math.exp(-grip * dt);
  } else {
    vf -= Math.sign(vf) * AIR_DRAG * vf * vf * dt;
    vl *= Math.exp(-0.4 * dt);
  }

  vf = Math.max(-REVERSE, Math.min(BOOST_MAX, vf));
  car.vx = fx * vf + rx * vl;
  car.vz = fz * vf + rz * vl;

  const prevX = car.x, prevZ = car.z;
  car.x += car.vx * dt;
  car.z += car.vz * dt;

  let next = sampler.at(car.x, car.z, car.y);
  let nextY = next.onRoad ? next.y : TERRAIN_Y;

  // The side of a raised piece is a wall, not a ramp.
  let walled = false;
  if (car.grounded && nextY > car.y + 1.2) {
    walled = true;
    car.x = prevX; car.z = prevZ;
    vf *= 0.2; vl *= 0.2;
    car.vx = fx * vf + rx * vl;
    car.vz = fz * vf + rz * vl;
    next = sampler.at(car.x, car.z, car.y);
    nextY = next.onRoad ? next.y : TERRAIN_Y;
  }

  // Follow the surface: climbing sticks, dropping away launches.
  let landed = false;
  if (car.grounded) {
    const climb = next.onRoad ? next.gx * car.vx + next.gz * car.vz : 0;
    if (nextY >= car.y - 0.6) {
      car.y = nextY;
      car.vy = climb;
    } else {
      car.grounded = false;
      car.vy = climb;          // keep the launch angle off a kicker
    }
  }
  if (!car.grounded) {
    car.vy -= GRAVITY * dt;
    car.y += car.vy * dt;
    if (car.y <= nextY) {
      car.y = nextY;
      if (car.vy < -14) { vf *= 0.9; car.vx *= 0.9; car.vz *= 0.9; }
      car.vy = 0;
      car.grounded = true;
      landed = true;
    }
  }

  car.wheelSpin += vf * dt * 1.4;

  // Body attitude: pitch follows the slope, roll leans into the turn.
  const surfPitch = next.onRoad ? next.gx * fx + next.gz * fz : 0;
  const targetPitch = car.grounded
    ? -Math.atan2(surfPitch, 1)
    : Math.atan2(-car.vy, Math.max(6, Math.abs(vf))) * 0.4;
  const targetRoll = -car.steer * Math.min(1, Math.abs(vf) / MAX_SPEED) * 0.16 - (vl / MAX_SPEED) * 0.25;
  car.pitch += (targetPitch - car.pitch) * Math.min(1, dt * 8);
  car.roll += (targetRoll - car.roll) * Math.min(1, dt * 8);

  return { surface: next, onRoad: next.onRoad, speed: Math.hypot(car.vx, car.vz), landed, walled };
}
