import type { PetProfile } from '../core/profile';
import type { Frame } from '../core/types';
import type { Bubble } from '../ui/bubble';

/**
 * Placeholder renderer: draws the pet procedurally so M0 needs no art.
 *
 * M1 replaces this with a sprite-atlas renderer behind the same two-call surface
 * (`resize`, `draw`). Everything is drawn in window-local logical px.
 */
export class CanvasRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly profile: PetProfile;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;

  constructor(canvas: HTMLCanvasElement, profile: PetProfile) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');
    this.canvas = canvas;
    this.ctx = ctx;
    this.profile = profile;
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    if (cssW <= 0 || cssH <= 0) return;
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
  }

  draw(frame: Frame, bubble: Bubble | null, debug = false): void {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);

    // Feet stay planted at the anchor while the window moves, so keep sub-pixel smoothness.
    const cx = frame.pos.x - frame.win.x;
    const footY = frame.pos.y - frame.win.y;
    const r = this.profile.radius;
    const rx = r * (1 - frame.squash * 0.55);
    const ry = r * (1 + frame.squash);
    const cy = footY - 3 - ry;

    this.drawShadow(cx, footY, rx);
    this.drawFeet(cx, footY, rx, frame);
    this.drawBody(cx, cy, rx, ry);
    this.drawFace(cx, cy, rx, ry, frame);
    this.drawMoodMarks(cx, cy, ry, frame);

    if (bubble && bubble.visible) {
      bubble.draw(ctx, cx, cy - ry - 10, this.profile.window.w - 16);
    }
    if (debug) this.drawDebug(cx, footY);
  }

  private drawShadow(cx: number, footY: number, rx: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.beginPath();
    ctx.ellipse(cx, footY + 1, rx * 0.85, rx * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawFeet(cx: number, footY: number, rx: number, frame: Frame): void {
    const { ctx } = this;
    const phase = frame.state === 'walk' ? frame.stateTime * 9 : 0;
    const liftL = frame.state === 'walk' ? Math.max(0, Math.sin(phase)) * 5 : 0;
    const liftR = frame.state === 'walk' ? Math.max(0, Math.sin(phase + Math.PI)) * 5 : 0;

    ctx.save();
    ctx.fillStyle = this.profile.colors.bodyBottom;
    for (const [dx, lift] of [
      [-rx * 0.42, liftL],
      [rx * 0.42, liftR],
    ] as const) {
      ctx.beginPath();
      ctx.ellipse(cx + dx, footY - 4 - lift, rx * 0.24, rx * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawBody(cx: number, cy: number, rx: number, ry: number): void {
    const { ctx } = this;
    const { colors } = this.profile;

    const gradient = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
    gradient.addColorStop(0, colors.bodyTop);
    gradient.addColorStop(1, colors.bodyBottom);

    ctx.save();
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    // Rim light, so the blob reads as a volume at small sizes too.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx - 0.75, ry - 0.75, 0, Math.PI * 0.85, Math.PI * 1.75);
    ctx.stroke();
    ctx.restore();
  }

  private drawFace(cx: number, cy: number, rx: number, ry: number, frame: Frame): void {
    const { ctx } = this;
    const { colors } = this.profile;

    const eyeDX = rx * 0.33;
    const eyeY = cy - ry * 0.12;
    const eyeR = Math.min(rx, ry) * 0.3;
    const asleep = frame.state === 'sleep';
    const closed = asleep || frame.blink > 0.55;
    const happy = frame.state === 'happy';

    // Blush.
    ctx.save();
    ctx.fillStyle = colors.blush;
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + dir * rx * 0.6, cy + ry * 0.18, rx * 0.14, rx * 0.09, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    for (const dir of [-1, 1]) {
      const ex = cx + dir * eyeDX;
      if (closed || happy) {
        ctx.save();
        ctx.strokeStyle = colors.eye;
        ctx.lineWidth = Math.max(1.5, eyeR * 0.28);
        ctx.lineCap = 'round';
        ctx.beginPath();
        if (happy) {
          // ^ ^ happy eyes
          ctx.arc(ex, eyeY + eyeR * 0.35, eyeR * 0.75, Math.PI * 1.15, Math.PI * 1.85);
        } else {
          ctx.moveTo(ex - eyeR * 0.8, eyeY);
          ctx.quadraticCurveTo(ex, eyeY + eyeR * 0.5, ex + eyeR * 0.8, eyeY);
        }
        ctx.stroke();
        ctx.restore();
        continue;
      }

      const squish = 1 - frame.blink;
      ctx.fillStyle = colors.eyeWhite;
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, eyeR * 0.82, Math.max(0.6, eyeR * squish), 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = colors.eye;
      ctx.beginPath();
      ctx.ellipse(
        ex + frame.gaze.x * eyeR * 0.55,
        eyeY + frame.gaze.y * eyeR * 0.55,
        eyeR * 0.44,
        eyeR * 0.44 * squish,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    // Mouth.
    ctx.save();
    ctx.strokeStyle = colors.eye;
    ctx.lineWidth = Math.max(1.4, eyeR * 0.22);
    ctx.lineCap = 'round';
    ctx.beginPath();
    const mouthY = cy + ry * 0.36;
    const mouthW = rx * 0.2;
    if (asleep) {
      ctx.moveTo(cx - mouthW * 0.5, mouthY);
      ctx.lineTo(cx + mouthW * 0.5, mouthY);
    } else if (happy) {
      ctx.arc(cx, mouthY - mouthW * 0.4, mouthW, Math.PI * 0.15, Math.PI * 0.85);
    } else if (frame.state === 'drag') {
      ctx.ellipse(cx, mouthY, mouthW * 0.5, mouthW * 0.6, 0, 0, Math.PI * 2);
    } else {
      ctx.arc(cx, mouthY - mouthW * 0.3, mouthW * 0.8, Math.PI * 0.25, Math.PI * 0.75);
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawMoodMarks(cx: number, cy: number, ry: number, frame: Frame): void {
    if (frame.state !== 'sleep') return;
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = 'rgba(190, 215, 235, 0.75)';
    ctx.font = '600 14px ui-sans-serif, system-ui, sans-serif';
    const drift = (frame.stateTime % 2) / 2;
    ctx.globalAlpha = 0.8 - drift * 0.6;
    ctx.fillText('z', cx + ry * 0.55, cy - ry * 0.55 - drift * 10);
    ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('z', cx + ry * 0.78, cy - ry * 0.95 - drift * 8);
    ctx.restore();
  }

  private drawDebug(cx: number, footY: number): void {
    const { ctx } = this;
    const win = this.profile;
    ctx.save();
    ctx.strokeStyle = 'rgba(80, 220, 200, 0.9)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    for (const [x, y, w, h] of [[win.hit.x, win.hit.y, win.hit.w, win.hit.h]] as const) {
      ctx.strokeRect(x, y, w, h);
    }
    ctx.beginPath();
    ctx.moveTo(cx - 6, footY);
    ctx.lineTo(cx + 6, footY);
    ctx.moveTo(cx, footY - 6);
    ctx.lineTo(cx, footY + 6);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeRect(0.5, 0.5, win.window.w - 1, win.window.h - 1);
    ctx.restore();
  }
}
