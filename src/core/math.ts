import type { Rect, Vec2 } from './types';

export function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Frame-rate independent easing factor for exponential smoothing. */
export function smooth(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

export function approach(v: number, target: number, maxDelta: number): number {
  if (v < target) return Math.min(v + maxDelta, target);
  return Math.max(v - maxDelta, target);
}

export function pointInRect(p: Vec2, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Sign of a value with a sane fallback, typed for facing math. */
export function signOr(v: number, fallback: 1 | -1): 1 | -1 {
  if (v > 0) return 1;
  if (v < 0) return -1;
  return fallback;
}
