/**
 * Shared geometry / value types.
 *
 * Everything in `core/` speaks in **logical screen coordinates** (CSS px, origin at the
 * top-left of the virtual desktop, Y down) unless a name says otherwise. The window is moved
 * by the difference between the pet's foot position and its anchor inside the window, so the
 * simulation never needs to know about DPI.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type PetState = 'idle' | 'walk' | 'sleep' | 'drag' | 'fall' | 'land' | 'happy';

/** One rendered frame. Produced by the sim, consumed by the renderer and the host. */
export interface Frame {
  state: PetState;
  /** 1 = facing right, -1 = facing left. */
  facing: 1 | -1;
  /** Foot anchor in logical screen coordinates. */
  pos: Vec2;
  /** Window top-left in logical screen coordinates (integer). */
  win: Vec2;
  /** Seconds spent in the current state. */
  stateTime: number;
  /** Squash-and-stretch: > 0 flattened, < 0 stretched. */
  squash: number;
  /** Gaze offset, each component in [-1, 1]. */
  gaze: Vec2;
  /** Blink amount, 1 = fully closed. */
  blink: number;
  /** True if the window moved since the previous frame. */
  moved: boolean;
}
