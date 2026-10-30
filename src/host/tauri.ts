import { invoke } from '@tauri-apps/api/core';
import type { Rect, Vec2 } from '../core/types';
import type { PetHost, PointerHandler, PointerKind } from './types';

/** Poll the OS cursor no faster than this (ms). 16 ms ≈ once per frame. */
const CURSOR_POLL_MS = 16;

/**
 * The real window. Rust owns the window; this class translates between the sim's logical screen
 * coordinates and the two things the webview can actually observe: window-local pointer events
 * and the global cursor position (polled from Rust).
 */
export class TauriHost implements PetHost {
  readonly kind = 'tauri' as const;

  private handler: PointerHandler | null = null;
  private cursorPos: Vec2 = { x: 0, y: 0 };
  private windowPos: Vec2 = { x: 0, y: 0 };
  private polledAt = 0;
  private polling = false;

  async init(): Promise<void> {
    document.body.classList.add('tauri');

    // The window is created hidden so the first paint is the pet, not a white flash.
    // Two frames guarantees the canvas has been drawn at least once.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void invoke('ready').catch(() => {
          /* window may already be visible */
        });
      });
    });

    window.addEventListener('blur', () => this.handler?.({ kind: 'up', screen: this.cursorPos, buttons: 0 }));
  }

  workArea(): Rect {
    const screen = window.screen as Screen & { availLeft?: number; availTop?: number };
    const w = screen.availWidth || window.innerWidth;
    const h = screen.availHeight || window.innerHeight;
    return { x: screen.availLeft ?? 0, y: screen.availTop ?? 0, w, h };
  }

  devicePixelRatio(): number {
    return window.devicePixelRatio || 1;
  }

  cursor(): Vec2 {
    return this.cursorPos;
  }

  refresh(): void {
    const now = performance.now();
    if (this.polling || now - this.polledAt < CURSOR_POLL_MS) return;
    this.polledAt = now;
    this.polling = true;
    void invoke<[number, number] | null>('cursor_position')
      .then((p) => {
        if (Array.isArray(p) && p.length === 2) this.cursorPos = { x: p[0]!, y: p[1]! };
      })
      .catch(() => {
        /* ignore: the sim just keeps the last known cursor */
      })
      .finally(() => {
        this.polling = false;
      });
  }

  setWindowPos(p: Vec2): void {
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    if (x === this.windowPos.x && y === this.windowPos.y) return;
    this.windowPos = { x, y };
    void invoke('set_pet_window', { x, y }).catch(() => {
      /* ignore transient move failures (e.g. during shutdown) */
    });
  }

  log(message: string): void {
    void invoke('log', { message }).catch(() => {
      /* logging must never be the thing that breaks */
    });
  }

  onPointer(handler: PointerHandler): void {
    this.handler = handler;

    // Window-local pointer events → logical screen coordinates.
    document.addEventListener('pointermove', (e) => this.emit('move', e));
    document.addEventListener('pointerdown', (e) => {
      try {
        document.body.setPointerCapture(e.pointerId);
      } catch {
        /* capture is best effort */
      }
      this.emit('down', e);
    });
    document.addEventListener('pointerup', (e) => this.emit('up', e));
    document.addEventListener('pointercancel', (e) => this.emit('up', e));
  }

  private emit(kind: PointerKind, e: PointerEvent): void {
    this.handler?.({
      kind,
      screen: { x: this.windowPos.x + e.clientX, y: this.windowPos.y + e.clientY },
      buttons: e.buttons,
    });
  }
}
