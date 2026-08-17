// Poly Racer arcade car physics.
//
// Deliberately free of three.js and React so the same integrator that the
// runner uses can be driven headlessly in tests. Fixed-step: call
// stepCar() at STEP seconds, never with a variable dt.
import { TERRAIN_Y, type Sampler, type Surface } from "./polytrack-engine";

/** Fixed simulation step, in seconds. */
export const STEP = 1 / 120;

/**
 * World units per km/h — the scale between the simulation and the speedo.
 *
 * Held fixed at the value the car has always used (46 u/s read as 100
 * km/h), so changing TOP_SPEED_KMH changes how fast the car actually goes
 * rather than only what the dial says. Setting the dial alone would leave
 * every lap time identical and the number a decoration.
 */
export const UNITS_PER_KMH = 46 / 100;

/** What the car actually reaches on flat tarmac, unboosted. */
export const TOP_SPEED_KMH = 80;

/** That speed in world units — where push and drag balance. */
export const TOP_SPEED = TOP_SPEED_KMH * UNITS_PER_KMH;  // 36.8 u/s

/**
 * The asymptote the engine pulls against, and the hard clamp.
 *
 * Sits above TOP_SPEED on purpose. The engine's push fades to nothing as
 * the car nears this figure, so a car whose asymptote *is* its top speed
 * would approach it and never arrive. The speed the car reaches is set by
 * where push meets drag, which is TOP_SPEED.
 *
 * This is worth stating plainly because the old constants did not: the car
 * was written as topping out at 100 km/h and in fact settled at about 53,
 * because drag balanced the engine less than two thirds of the way up. The
 * dial was scaled to a speed nothing ever reached.
 */
export const MAX_SPEED = 40;

/**
 * Engine and rolling resistance, solved together rather than picked.
 *
 * Two conditions had to hold at once: pulling away had to feel exactly as
 * it did before, and the car had to genuinely settle at 80 km/h instead of
 * aiming at a number it never met. Two equations, two unknowns — net
 * acceleration at 5 u/s matches the old car to three decimal places, and
 * push equals drag at 36.8 u/s.
 *
 * The lever that raises the top end is the drag, not the engine: at low
 * speed rolling resistance is a rounding error next to 26 units of push,
 * so cutting it barely touches the launch, while at the top it is most of
 * what was holding the car back. Which is why the extra speed appears
 * where it was asked for and nowhere else.
 *
 * One consequence worth knowing: with less rolling resistance the car
 * coasts noticeably further off the throttle.
 */
export const ENGINE = 25.887;

/**
 * Shape of the engine's push as the car fills its speed range.
 *
 * The push scales with headroom — how much of the ceiling is left — so the
 * car eases up to its top speed rather than slamming into it. Raising that
 * headroom to a power below 1 keeps the push higher for longer near the
 * top, without touching the bottom: at a standstill headroom is 1, and 1
 * to any power is still 1, so pulling away from a corner feels exactly as
 * it did.
 *
 * That is the whole point of the exponent. Lowering the ceiling from 100
 * to 80 km/h shrinks headroom at every speed, which would have made the
 * car duller everywhere. This restores the top of the range only.
 */
export const ENGINE_CURVE = 0.65;

/**
 * Multiplier on ENGINE. Since the push fades with headroom rather than
 * being clamped, a bigger engine both pulls harder and settles a little
 * faster — it moves the point where push and drag balance. MAX_SPEED is
 * still an absolute ceiling no tuning can cross.
 */
export type CarTuning = { engineScale?: number };
export const STOCK_TUNING: CarTuning = { engineScale: 1 };
export const REVERSE = 16;
export const BRAKE = 60;
export const ROLL_DRAG = 0.0773;  // linear rolling resistance — see ENGINE
export const AIR_DRAG = 0.0016;   // quadratic
export const GRIP = 9;            // lateral velocity bleed-off, per second
export const DRIFT_GRIP = 2.2;
export const OFF_GRIP = 4.5;
export const OFF_DRAG = 3.4;      // grass is slow
export const OFF_MAX = 20;
export const TURN_RATE = 2.4;     // rad/s at the sweet spot
export const AIR_TURN = 0.9;
export const GRAVITY = 34;
/* ── Boost ────────────────────────────────────────────────────────────
 *
 * A pad adds one stack, up to three, and each stack lifts the ceiling by
 * 15 km/h — so 95, 110, then 125 km/h. The stack then bleeds away over a
 * recovery window and the car settles back to 80.
 *
 * The window is longer when you are carrying more: a single boost is gone
 * in two seconds, three take four. Deliberately not proportional. Stacking
 * to three is meant to be worth the trouble of chaining pads, so the third
 * stack has to last longer than the first did, not merely as long.
 */
export const BOOST_STEP_KMH = 15;
export const BOOST_STEP = BOOST_STEP_KMH * UNITS_PER_KMH;
export const BOOST_MAX_STACKS = 3;

/** Seconds to bleed off, indexed by stack count. Index 0 is unused. */
export const BOOST_RECOVER_S = [0, 2, 3.5, 4] as const;

/** Absolute ceiling: three stacks on top of the top speed. 125 km/h. */
export const BOOST_MAX = TOP_SPEED + BOOST_MAX_STACKS * BOOST_STEP;

/** How hard a pad shoves, while you are on it. */
export const BOOST_ACCEL = 55;
/**
 * World units/s → the number shown on the speedo.
 *
 * Derived from MAX_SPEED rather than written as a literal, so the two
 * cannot drift apart: retune the car's top speed and the dial still
 * reads TOP_SPEED_KMH at the top of it. Boost briefly goes past this,
 * which is the point of a boost.
 */
export const SPEED_TO_KMH = 1 / UNITS_PER_KMH;

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
  /** Boost stacks held, 0..BOOST_MAX_STACKS. */
  boostStacks: number;
  /** Seconds left before the stack has fully bled away. */
  boostTimer: number;
  /** Was the car on a pad last step? Stacks are added on entry, not per frame. */
  onBoostTile: boolean;
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
  return {
    x, y, z, vx: 0, vy: 0, vz: 0, yaw, steer: 0, grounded: true,
    wheelSpin: 0, pitch: 0, roll: 0,
    boostStacks: 0, boostTimer: 0, onBoostTile: false,
  };
}

export function resetCar(car: CarState, x: number, y: number, z: number, yaw: number): void {
  car.x = x; car.y = y; car.z = z; car.yaw = yaw;
  car.vx = 0; car.vy = 0; car.vz = 0;
  car.steer = 0; car.pitch = 0; car.roll = 0;
  car.grounded = true;
  car.boostStacks = 0; car.boostTimer = 0; car.onBoostTile = false;
}

/**
 * Advance the car by one fixed step. Grip is split into a forward and a
 * lateral component in the car's own frame, which is what gives the
 * handbrake its slide and the tyres their bite.
 */
export function stepCar(
  car: CarState,
  input: CarInput,
  dt: number,
  sampler: Sampler,
  tuning: CarTuning = STOCK_TUNING,
): StepResult {
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

  /* ── Boost bookkeeping ──────────────────────────────────────────────
     A stack is added on entering a pad, not once per frame, or a single
     pad would max the stack out instantly. While the car is on the pad the
     timer is held full, so a long pad keeps you up there; once off, it
     counts down and the extra ceiling bleeds away with it. */
  const onPad = onRoad && surf.tile?.type === "boost";
  const gained = onPad && !car.onBoostTile;
  if (gained) {
    car.boostStacks = Math.min(BOOST_MAX_STACKS, car.boostStacks + 1);
  }
  car.onBoostTile = onPad;

  const recover = BOOST_RECOVER_S[car.boostStacks] ?? 0;
  if (car.boostStacks > 0) {
    car.boostTimer = onPad ? recover : Math.max(0, car.boostTimer - dt);
    if (car.boostTimer <= 0) car.boostStacks = 0;
  }

  /* The ceiling falls with the timer rather than dropping off a cliff, so
     the car coasts back down to its own top speed instead of being yanked
     there. */
  const boostFrac = recover > 0 ? car.boostTimer / recover : 0;

  /* The speed a boost holds you at, which falls with the timer.
     Expressed as a speed the car is held *at* rather than an asymptote it
     is pulled toward: the engine only ever approaches an asymptote, so
     raising one by 15 km/h would deliver rather less than 15 km/h, and the
     stated numbers would quietly not be the numbers. */
  const boostHold = TOP_SPEED + car.boostStacks * BOOST_STEP * boostFrac;

  /* A boost lands at once. Accelerating into it instead would mean never
     quite arriving: the recovery clock starts the moment the stack is
     taken, so by the time the car had worked its way up to +15 the window
     would already have eaten most of it, and every stack would peak at the
     same wrong number. Hitting a pad is meant to feel like a shove. */
  if (gained) vf = Math.max(vf, boostHold);

  if (car.grounded) {
    /* The throttle clamp has to yield to a live boost, or it claws back
       the extra speed on the very next frame and a pad does nothing. */
    const maxSpeed = onRoad ? Math.max(MAX_SPEED, boostHold) : OFF_MAX;
    if (input.throttle > 0) {
      /* Engine push fades as the car approaches its ceiling, so speed
         eases in rather than ramping at a constant rate all the way up.
         This is the car's original feel and the one to keep.
         It was briefly replaced with constant pull and a hard clamp, to
         make a stronger engine change only how *soon* the top speed
         arrived. That did hold the cap — but it also made every car
         accelerate far harder than it used to, which is the wrong trade:
         how the car feels off the line matters more than whether the
         speedo can reach its last few km/h. The clamp stays as a
         backstop below; the headroom term is what normally limits speed,
         settling the car where push and drag balance. */
      const headroom = Math.max(0, 1 - Math.max(0, vf) / maxSpeed);
      vf += ENGINE * (tuning.engineScale ?? 1) * Math.pow(headroom, ENGINE_CURVE) * dt;
      if (vf > maxSpeed) vf = maxSpeed;
    } else if (input.throttle < 0) {
      vf -= (vf > 0.5 ? BRAKE : REVERSE) * dt;
    }
    if (input.drift) vf -= vf * 0.9 * dt;
    // The shove itself, while on the pad. Bounded by what this stack is
    // worth, so one pad cannot deliver three pads' worth of speed.
    if (onPad) {
      vf = Math.min(boostHold, vf + BOOST_ACCEL * dt);
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

  /* While a stack is live the boost sustains the car against drag, so the
     speed follows boostHold down as the timer runs out — the car bleeds
     back to 80 over the recovery window rather than dropping the moment
     the pad ends. Only ever a floor: going quicker downhill is still
     allowed. */
  if (boostFrac > 0 && vf < boostHold) {
    vf = Math.min(boostHold, vf + BOOST_ACCEL * dt);
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
