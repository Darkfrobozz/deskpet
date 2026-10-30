import { approach, clamp, lerp, pointInRect, signOr, smooth } from './math';
import { MoodPicker, type PetProfile } from './profile';
import type { Frame, PetState, Rect, Vec2 } from './types';

export interface World {
  /** Work area (screen minus taskbar/dock) of the monitor the pet lives on, logical px. */
  workArea: Rect;
}

/** Simulation runs at a fixed rate, decoupled from rendering. */
const STEP = 1 / 120;

/**
 * The pet simulation. Pure: no DOM, no Tauri, no timers. Feed it `dt` and the cursor, and it
 * produces a `Frame`; the host decides what to do with the window position in it.
 */
export class Pet {
  readonly profile: PetProfile;
  readonly world: World;

  /** Foot anchor in logical screen coordinates. */
  pos: Vec2;
  vel: Vec2 = { x: 0, y: 0 };
  facing: 1 | -1 = 1;

  private readonly mood: MoodPicker;
  private readonly rng: () => number;
  private state: PetState = 'idle';
  private stateTime = 0;
  private airborne = false;
  private dragging = false;
  private dragOffset: Vec2 = { x: 0, y: 0 };
  private squash = 0;
  private squashVel = 0;
  private gaze: Vec2 = { x: 0, y: 0 };
  private blink = 0;
  private blinkIn = 2.5;
  private accum = 0;
  private moved = false;
  private lastWin: Vec2 | null = null;

  constructor(profile: PetProfile, world: World, rng: () => number = Math.random) {
    this.profile = profile;
    this.world = world;
    this.rng = rng;
    this.mood = new MoodPicker(profile.moods, rng);
    this.pos = {
      x: world.workArea.x + world.workArea.w * 0.5,
      y: this.groundY,
    };
  }

  get currentState(): PetState {
    return this.state;
  }

  /** Window top-left, integer-rounded so the native window does not shimmer. */
  get windowPos(): Vec2 {
    return {
      x: Math.round(this.pos.x - this.profile.anchor.x),
      y: Math.round(this.pos.y - this.profile.anchor.y),
    };
  }

  /** True when a screen-space point lands on the pet's opaque area. */
  hitTest(screen: Vec2): boolean {
    const win = this.windowPos;
    return pointInRect({ x: screen.x - win.x, y: screen.y - win.y }, this.profile.hit);
  }

  // ---------------------------------------------------------------- input

  grab(screen: Vec2): void {
    this.dragging = true;
    this.airborne = false;
    this.dragOffset = { x: this.pos.x - screen.x, y: this.pos.y - screen.y };
    this.vel = { x: 0, y: 0 };
    this.setState('drag');
  }

  release(): void {
    if (!this.dragging) return;
    this.dragging = false;

    const { throwScale } = this.profile.motion;
    this.vel = {
      x: clamp(this.vel.x * throwScale, -1600, 1600),
      y: clamp(this.vel.y * throwScale, -1600, 1600),
    };

    if (this.pos.y < this.groundY - 1) {
      this.airborne = true;
      this.setState('fall');
    } else {
      this.pos.y = this.groundY;
      this.vel.x = 0;
      this.setState('idle');
    }
  }

  /** Click reaction: a small hop. */
  poke(): void {
    if (this.dragging) return;
    this.vel.y = -this.profile.motion.hop;
    this.airborne = true;
    this.squashVel = -2.2;
    this.setState('happy');
  }

  // ---------------------------------------------------------------- tick

  /** Advance the simulation and produce the frame to draw. */
  tick(dtRaw: number, cursor: Vec2): Frame {
    this.accum += clamp(dtRaw, 0, 0.1);
    while (this.accum >= STEP) {
      this.step(STEP, cursor);
      this.accum -= STEP;
    }

    const win = this.windowPos;
    if (this.lastWin === null || win.x !== this.lastWin.x || win.y !== this.lastWin.y) {
      this.moved = true;
      this.lastWin = win;
    } else {
      this.moved = false;
    }

    return {
      state: this.state,
      facing: this.facing,
      pos: { x: this.pos.x, y: this.pos.y },
      win,
      stateTime: this.stateTime,
      squash: this.squash,
      gaze: { x: this.gaze.x, y: this.gaze.y },
      blink: this.blink,
      moved: this.moved,
    };
  }

  // ---------------------------------------------------------------- steps

  private step(dt: number, cursor: Vec2): void {
    this.stateTime += dt;
    this.updateGaze(dt, cursor);
    this.updateBlink(dt);
    this.updateSquash(dt);

    if (this.dragging) {
      this.stepDrag(dt, cursor);
      return;
    }
    if (this.airborne) {
      this.stepAir(dt);
      return;
    }
    this.stepGround(dt, cursor);
  }

  private stepDrag(dt: number, cursor: Vec2): void {
    const target = { x: cursor.x + this.dragOffset.x, y: cursor.y + this.dragOffset.y };
    const k = smooth(this.profile.motion.dragRate, dt);
    const nextX = lerp(this.pos.x, target.x, k);
    const nextY = lerp(this.pos.y, target.y, k);

    this.vel = { x: (nextX - this.pos.x) / dt, y: (nextY - this.pos.y) / dt };
    this.pos = { x: nextX, y: nextY };
    this.clampInside();
  }

  private stepAir(dt: number): void {
    this.vel.y += this.profile.motion.gravity * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.clampX();

    if (this.pos.y >= this.groundY) {
      this.land();
    } else if (this.pos.y < this.minY) {
      this.pos.y = this.minY;
      this.vel.y = Math.max(this.vel.y, 0);
    }
  }

  private stepGround(dt: number, cursor: Vec2): void {
    this.mood.advance(dt);
    if (this.mood.expired) this.setState(this.mood.next(this.state));

    if (this.state === 'walk' && this.stateTime === 0) {
      // Pick a direction when a walk starts: usually toward the cursor.
      const toward = signOr(cursor.x - this.pos.x, this.facing);
      this.facing = this.rng() < 0.65 ? toward : this.rng() < 0.5 ? -1 : 1;
    }

    if (this.state === 'walk') {
      this.vel.x = this.facing * this.profile.motion.walk;
    } else {
      this.vel.x = approach(this.vel.x, 0, 400 * dt);
    }

    this.pos.x += this.vel.x * dt;
    this.pos.y = this.groundY;
    this.clampX();
  }

  private land(): void {
    const impact = Math.abs(this.vel.y);
    this.pos.y = this.groundY;
    this.vel = { x: this.vel.x * 0.35, y: 0 };
    this.airborne = false;
    this.squash = clamp(impact / 1100, 0.06, 0.55);
    this.squashVel = 0;
    this.setState('land');
  }

  // ---------------------------------------------------------------- derived

  private get groundY(): number {
    const { workArea: wa } = this.world;
    return wa.y + wa.h - this.profile.window.h + this.profile.anchor.y;
  }

  private get minX(): number {
    return this.world.workArea.x + this.profile.anchor.x;
  }

  private get maxX(): number {
    const { workArea: wa } = this.world;
    return wa.x + wa.w - this.profile.window.w + this.profile.anchor.x;
  }

  private get minY(): number {
    return this.world.workArea.y + this.profile.anchor.y;
  }

  private clampX(): void {
    const lo = this.minX;
    const hi = Math.max(lo, this.maxX);
    if (this.pos.x <= lo) {
      this.pos.x = lo;
      this.facing = 1;
      this.vel.x = Math.abs(this.vel.x) * 0.5;
    } else if (this.pos.x >= hi) {
      this.pos.x = hi;
      this.facing = -1;
      this.vel.x = -Math.abs(this.vel.x) * 0.5;
    }
  }

  private clampInside(): void {
    this.clampX();
    const hiY = Math.max(this.minY, this.groundY);
    this.pos.y = clamp(this.pos.y, this.minY, hiY);
  }

  // ---------------------------------------------------------------- visuals

  private updateGaze(dt: number, cursor: Vec2): void {
    const cx = this.pos.x;
    const cy = this.pos.y - this.profile.radius;
    const dx = cursor.x - cx;
    const dy = cursor.y - cy;
    const d = Math.hypot(dx, dy) || 1;
    const reach = this.profile.radius * 2.4;
    const k = smooth(8, dt);
    this.gaze = {
      x: lerp(this.gaze.x, (dx / d) * Math.min(1, d / reach), k),
      y: lerp(this.gaze.y, (dy / d) * Math.min(1, d / reach), k),
    };
  }

  private updateBlink(dt: number): void {
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blink = 1;
      this.blinkIn = 2.2 + this.rng() * 3.5;
    }
    if (this.blink > 0) this.blink = Math.max(0, this.blink - dt * 9);
  }

  private updateSquash(dt: number): void {
    const stiffness = 220;
    const damping = 14;
    this.squashVel += (-this.squash * stiffness - this.squashVel * damping) * dt;
    this.squash += this.squashVel * dt;
    this.squash = clamp(this.squash, -0.35, 0.6);
  }

  private setState(next: PetState): void {
    if (next === this.state) return;
    this.state = next;
    this.stateTime = 0;
    this.mood.reset(next);
    if (next === 'sleep') this.blink = 1;
  }
}

