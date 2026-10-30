import './style.css';
import { distance } from './core/math';
import { Pet } from './core/pet';
import { blobProfile } from './core/profile';
import type { Vec2 } from './core/types';
import { createHost } from './host';
import { CanvasRenderer } from './render/canvas2d';
import { Bubble } from './ui/bubble';

const LINES = ['boop', 'hii', 'again?', 'hm?', 'owo', 'hey'];

const canvas = document.querySelector<HTMLCanvasElement>('#pet');
if (!canvas) throw new Error('#pet canvas missing');

void boot(canvas);

async function boot(petCanvas: HTMLCanvasElement): Promise<void> {
  const host = await createHost();
  await host.init();

  const pet = new Pet(blobProfile, { workArea: host.workArea() });
  const renderer = new CanvasRenderer(petCanvas, blobProfile);
  const bubble = new Bubble();
  let debug = false;

  // The canvas is always window-local: 200×200 in the real window, and a 200×200 div in the
  // playground. Size it from its own box so both modes share one code path.
  const fit = (): void => {
    const rect = petCanvas.getBoundingClientRect();
    renderer.resize(rect.width, rect.height, host.devicePixelRatio());
  };
  fit();
  new ResizeObserver(fit).observe(petCanvas);
  window.addEventListener('resize', fit);

  // Put the window (real or fake) where the pet is before the first frame.
  host.setWindowPos(pet.windowPos);

  let pressAt: { at: Vec2; time: number } | null = null;
  let dragged = false;

  host.onPointer((info) => {
    if (info.kind === 'down') {
      if (!pet.hitTest(info.screen)) return;
      pressAt = { at: info.screen, time: performance.now() };
      dragged = false;
      pet.grab(info.screen);
      return;
    }

    if (!pressAt) return;

    if (info.kind === 'move') {
      if (distance(pressAt.at, info.screen) > 4) dragged = true;
      return;
    }

    const tapped = !dragged && performance.now() - pressAt.time < 400;
    pet.release();
    if (tapped) {
      pet.poke();
      bubble.say(LINES[Math.floor(Math.random() * LINES.length)]!);
    }
    pressAt = null;
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'd' || event.key === 'D') debug = !debug;
  });

  let last = performance.now();
  let fps = 60;

  // A throw anywhere in here used to kill the loop forever: requestAnimationFrame was the last
  // statement, so one exception meant a frozen pet with no way to recover and nothing in the log
  // (the webview has no console in a release build). Reschedule first, then it survives anything.
  let frameErrors = 0;

  const frame = (now: number): void => {
    try {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (dt > 0) fps = fps * 0.92 + (1 / dt) * 0.08;

      host.refresh();
      const current = pet.tick(dt, host.cursor());
      bubble.update(dt);

      renderer.draw(current, bubble, debug);
      host.setWindowPos(current.win);

      host.status?.(
        `${current.state.padEnd(6)} x${Math.round(current.pos.x)} y${Math.round(current.pos.y)}  ${Math.round(fps)} fps`,
      );
    } catch (error) {
      frameErrors += 1;
      if (frameErrors === 1) {
        console.error('[deskpet] frame failed', error);
        host.log?.(`frame failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
      }
    } finally {
      requestAnimationFrame(frame);
    }
  };

  requestAnimationFrame(frame);
}
