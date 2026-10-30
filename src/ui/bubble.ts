/**
 * A one-line speech bubble drawn into the pet's own canvas.
 *
 * Kept deliberately dumb: it never resizes the window, so it must fit inside the window above
 * the pet. Two lines max, ellipsis beyond that.
 */
export class Bubble {
  private text = '';
  private ttl = 0;
  private duration = 0;

  say(text: string, seconds = 2.4): void {
    this.text = text;
    this.ttl = seconds;
    this.duration = seconds;
  }

  update(dt: number): void {
    if (this.ttl > 0) this.ttl = Math.max(0, this.ttl - dt);
  }

  get visible(): boolean {
    return this.ttl > 0 && this.text.length > 0;
  }

  draw(ctx: CanvasRenderingContext2D, cx: number, bottomY: number, maxW: number): void {
    if (!this.visible) return;

    const fade = Math.min(1, this.ttl / 0.35, (this.duration - this.ttl) / 0.12 + 0.2);
    const fontSize = 12;
    const padX = 8;
    const padY = 5;
    const lineH = fontSize + 3;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, fade));
    ctx.font = `500 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const lines = wrap(ctx, this.text, maxW - padX * 2, 2);
    const textW = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const boxW = Math.min(maxW, textW + padX * 2);
    const boxH = lines.length * lineH + padY * 2;
    const x = cx - boxW / 2;
    const y = bottomY - boxH;

    ctx.fillStyle = 'rgba(250, 250, 252, 0.95)';
    ctx.strokeStyle = 'rgba(40, 40, 50, 0.18)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.roundRect(x, y, boxW, boxH, 8);
    ctx.fill();
    ctx.stroke();

    // Tail.
    ctx.beginPath();
    ctx.moveTo(cx - 5, y + boxH - 0.5);
    ctx.lineTo(cx + 5, y + boxH - 0.5);
    ctx.lineTo(cx, y + boxH + 6);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#26262e';
    lines.forEach((line, i) => {
      ctx.fillText(line, cx, y + padY + i * lineH);
    });
    ctx.restore();
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxW || current === '') {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && current) lines.push(current);

  if (lines.length === maxLines) {
    const last = lines[maxLines - 1]!;
    if (ctx.measureText(last).width > maxW) {
      let trimmed = last;
      while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxW) {
        trimmed = trimmed.slice(0, -1);
      }
      lines[maxLines - 1] = `${trimmed}…`;
    }
  }
  return lines;
}
