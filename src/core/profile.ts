import type { PetState, Vec2 } from './types';

/** A grounded "mood" the pet can drift between while nothing else is happening. */
export interface MoodDef {
  /** Minimum seconds to stay in this mood. */
  min: number;
  /** Maximum seconds to stay in this mood. */
  max: number;
  /** Weighted candidates for the next mood. */
  next: Array<[PetState, number]>;
}

export type MoodTable = Partial<Record<PetState, MoodDef>>;

/**
 * Timed, weighted mood selection.
 *
 * Only *grounded* states live here (`idle`, `walk`, `sleep`, …). States driven by physics or
 * input (drag, fall, land, happy) are forced by the sim and simply reset the timer.
 */
export class MoodPicker {
  private readonly moods: MoodTable;
  private readonly rng: () => number;
  private elapsed = 0;
  private duration = 1;

  constructor(moods: MoodTable, rng: () => number = Math.random) {
    this.moods = moods;
    this.rng = rng;
    this.reset('idle');
  }

  reset(state: PetState): void {
    const mood = this.moods[state];
    this.elapsed = 0;
    // States with no mood entry (land, happy) are short-lived.
    this.duration = mood ? mood.min + this.rng() * Math.max(0, mood.max - mood.min) : 0.3;
  }

  advance(dt: number): void {
    this.elapsed += dt;
  }

  get expired(): boolean {
    return this.elapsed >= this.duration;
  }

  next(state: PetState): PetState {
    const mood = this.moods[state];
    if (!mood || mood.next.length === 0) return 'idle';

    const total = mood.next.reduce((sum, [, weight]) => sum + weight, 0);
    if (total <= 0) return state;

    let roll = this.rng() * total;
    for (const [candidate, weight] of mood.next) {
      roll -= weight;
      if (roll <= 0) return candidate;
    }
    return mood.next[mood.next.length - 1]![0];
  }
}

export interface PetProfile {
  /** Window size in logical px. */
  window: { w: number; h: number };
  /** Foot point inside the window (window-local). */
  anchor: Vec2;
  /** Clickable box inside the window (window-local). */
  hit: { x: number; y: number; w: number; h: number };
  /** Body radius in logical px, used by the placeholder renderer. */
  radius: number;
  colors: {
    bodyTop: string;
    bodyBottom: string;
    eye: string;
    eyeWhite: string;
    blush: string;
  };
  motion: {
    /** Walking speed, logical px/s. */
    walk: number;
    /** Gravity, logical px/s². */
    gravity: number;
    /** Upward impulse of a poke, logical px/s. */
    hop: number;
    /** Fraction of drag velocity kept on release. */
    throwScale: number;
    /** How snappily the pet follows the cursor when dragged. */
    dragRate: number;
  };
  moods: MoodTable;
}

/**
 * The placeholder blob. Drawn procedurally, so M0 needs no art assets — swapping in a sprite
 * atlas later is a renderer change, not a simulation change.
 */
export const blobProfile: PetProfile = {
  window: { w: 200, h: 200 },
  anchor: { x: 100, y: 186 },
  hit: { x: 50, y: 96, w: 100, h: 96 },
  radius: 42,
  colors: {
    bodyTop: '#ffb08a',
    bodyBottom: '#e8613f',
    eye: '#22161a',
    eyeWhite: '#fff8f4',
    blush: 'rgba(255, 110, 90, 0.35)',
  },
  motion: {
    walk: 46,
    gravity: 1500,
    hop: 470,
    throwScale: 0.55,
    dragRate: 22,
  },
  moods: {
    idle: { min: 2.5, max: 6, next: [['walk', 5], ['sleep', 0.6], ['idle', 1]] },
    walk: { min: 1.6, max: 4.5, next: [['idle', 4], ['walk', 2]] },
    sleep: { min: 12, max: 26, next: [['idle', 1]] },
  },
};
