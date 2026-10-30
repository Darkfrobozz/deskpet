import type { Rect, Vec2 } from '../core/types';

export type PointerKind = 'down' | 'move' | 'up';

/** Pointer sample already converted to logical *screen* coordinates. */
export interface PointerInfo {
  kind: PointerKind;
  screen: Vec2;
  buttons: number;
}

export type PointerHandler = (info: PointerInfo) => void;

/**
 * Everything the app needs from the outside world.
 *
 * Two implementations exist: `browser.ts` (the dev playground — fake desktop, no native window)
 * and `tauri.ts` (the real thing). `core/` never imports either of them.
 */
export interface PetHost {
  readonly kind: 'browser' | 'tauri';

  init(): Promise<void>;

  /** Work area of the monitor the pet is on, logical px. */
  workArea(): Rect;

  devicePixelRatio(): number;

  /** Cached cursor position in logical screen coordinates. */
  cursor(): Vec2;

  /** Kick off a refresh of `cursor()`; safe to call every frame. */
  refresh(): void;

  /** Move the native window / fake window to a logical screen position. */
  setWindowPos(p: Vec2): void;

  onPointer(handler: PointerHandler): void;

  /** Optional: playground shows a HUD, hosts without one ignore this. */
  status?(line: string): void;

  /** Optional: forward a message to the platform log (the webview console is invisible in release). */
  log?(message: string): void;
}
