import type { Rect, Vec2 } from '../core/types';
import type { PetHost, PointerHandler, PointerKind } from './types';

const TASKBAR_H = 44;

/**
 * Dev playground: renders the pet inside a fake desktop so the simulation and the renderer can
 * be developed in a normal browser, with no native window involved.
 *
 * The "window" is a div with a dashed outline — it moves exactly like the real one, which makes
 * window-position bugs visible without leaving the browser.
 */
export class BrowserHost implements PetHost {
  readonly kind = 'browser' as const;

  private handler: PointerHandler | null = null;
  private mouse: Vec2 = { x: 0, y: 0 };
  private petWin: HTMLDivElement | null = null;
  private hud: HTMLDivElement | null = null;
  private applied: Vec2 = { x: Number.NaN, y: Number.NaN };

  async init(): Promise<void> {
    document.body.classList.add('playground');

    const desk = document.createElement('div');
    desk.id = 'desk';
    desk.innerHTML = `
      <div id="wallpaper"></div>
      <div id="petwin"><span class="winlabel">pet window · 200×200</span></div>
      <div id="taskbar">
        <span>playground · fake desktop</span>
        <span class="spacer"></span>
        <span class="hint">drag the blob · click it · press D for debug</span>
      </div>
      <div id="hud"></div>
    `;
    document.body.append(desk);

    const petWin = desk.querySelector<HTMLDivElement>('#petwin');
    const hud = desk.querySelector<HTMLDivElement>('#hud');
    if (!petWin || !hud) throw new Error('playground DOM failed to build');
    this.petWin = petWin;
    this.hud = hud;

    const canvas = document.querySelector<HTMLCanvasElement>('#pet');
    if (canvas) petWin.append(canvas);

    this.bindPointer(desk);
  }

  workArea(): Rect {
    return {
      x: 0,
      y: 0,
      w: window.innerWidth,
      h: Math.max(140, window.innerHeight - TASKBAR_H),
    };
  }

  devicePixelRatio(): number {
    return window.devicePixelRatio || 1;
  }

  cursor(): Vec2 {
    return this.mouse;
  }

  refresh(): void {
    /* the browser gives us pointer events directly; nothing to poll */
  }

  setWindowPos(p: Vec2): void {
    if (!this.petWin) return;
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    if (x === this.applied.x && y === this.applied.y) return;
    this.applied = { x, y };
    this.petWin.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }

  onPointer(handler: PointerHandler): void {
    this.handler = handler;
  }

  status(line: string): void {
    if (this.hud) this.hud.textContent = line;
  }

  private bindPointer(desk: HTMLElement): void {
    this.mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

    desk.addEventListener('pointermove', (e) => {
      this.mouse = { x: e.clientX, y: e.clientY };
      this.emit('move', e);
    });
    desk.addEventListener('pointerdown', (e) => {
      this.mouse = { x: e.clientX, y: e.clientY };
      try {
        desk.setPointerCapture(e.pointerId);
      } catch {
        /* capture is best effort */
      }
      this.emit('down', e);
    });
    desk.addEventListener('pointerup', (e) => this.emit('up', e));
    desk.addEventListener('pointercancel', (e) => this.emit('up', e));
    window.addEventListener('blur', () => this.handler?.({ kind: 'up', screen: this.mouse, buttons: 0 }));
  }

  private emit(kind: PointerKind, e: PointerEvent): void {
    this.handler?.({ kind, screen: { x: e.clientX, y: e.clientY }, buttons: e.buttons });
  }
}
