#!/usr/bin/env node
/**
 * Generates the app/tray icons with zero dependencies.
 *
 * Tauri needs real files on disk at build time: a `.ico` for the Windows exe resource and the
 * window/tray icon, a `.icns` for macOS bundling, and PNGs for everything else. Committing
 * generated icons is normal for Tauri projects; this script exists so they are reproducible and
 * so nobody has to hand-draw a placeholder.
 *
 * The mark: a coral shrimp-ish blob on a dark rounded square. Deliberately readable at 16 px.
 *
 *   npm run icons
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const OUT_DIR = resolve(fileURLToPath(new URL('../src-tauri/icons', import.meta.url)));

// ---------------------------------------------------------------- png encoding

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- drawing

const hex = (s) => [
  parseInt(s.slice(1, 3), 16),
  parseInt(s.slice(3, 5), 16),
  parseInt(s.slice(5, 7), 16),
];

const BG = hex('#12171d');
const BODY = hex('#ff7a52');
const BODY_DARK = hex('#e0492a');
const EYE = hex('#1a1114');
const SHINE = [255, 255, 255];

/** Signed distance to a rounded box, in unit space. */
function sdRoundBox(px, py, cx, cy, hw, hh, r) {
  const dx = Math.abs(px - cx) - (hw - r);
  const dy = Math.abs(py - cy) - (hh - r);
  const ax = Math.max(dx, 0);
  const ay = Math.max(dy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(dx, dy), 0) - r;
}

function sdEllipse(px, py, cx, cy, rx, ry) {
  const dx = (px - cx) / rx;
  const dy = (py - cy) / ry;
  return (Math.hypot(dx, dy) - 1) * Math.min(rx, ry);
}

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function shade(x, y) {
  // Unit space, origin top-left. Rounded square plate.
  const plate = sdRoundBox(x, y, 0.5, 0.5, 0.42, 0.42, 0.15);
  if (plate > 0) return [0, 0, 0, 0];

  let color = BG.slice();
  let alpha = 1;

  // Shrimp body: a curved capsule approximated by two ellipses plus a tail fan.
  const body = Math.min(
    sdEllipse(x, y, 0.52, 0.46, 0.24, 0.17),
    sdEllipse(x, y, 0.40, 0.60, 0.19, 0.16),
  );
  const tail = sdEllipse(x, y, 0.30, 0.73, 0.10, 0.075);
  const shape = Math.min(body, tail);

  if (shape < 0) {
    const t = Math.min(1, Math.max(0, (y - 0.30) / 0.5));
    color = mix(BODY, BODY_DARK, t);
    // Half-tone banding so it reads as "segmented" even at 16 px.
    const band = Math.sin((y * 26 + x * 5) * 1.0) * 0.5 + 0.5;
    color = mix(color, BODY_DARK, band * 0.12);
  }

  // Antennae: two thin arcs sweeping up-right, behind the eye.
  const ant1 = Math.abs(Math.hypot(x - 0.60, y - 0.36) - 0.30) < 0.012 && x > 0.58 && y < 0.36;
  const ant2 = Math.abs(Math.hypot(x - 0.68, y - 0.40) - 0.33) < 0.010 && x > 0.62 && y < 0.38;
  if (ant1 || ant2) color = BODY;

  // Eye.
  const eye = sdEllipse(x, y, 0.635, 0.40, 0.035, 0.045);
  if (eye < 0) color = EYE;

  // Highlight.
  const shine = sdEllipse(x, y, 0.44, 0.40, 0.075, 0.045);
  if (shine < 0) {
    alpha = 1;
    color = mix(color, SHINE, 0.28);
  }

  // Soft inner rim so the plate does not float.
  if (plate > -0.006) color = mix(color, SHINE, 0.06);

  return [color[0], color[1], color[2], Math.round(alpha * 255)];
}

function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const samples = size <= 48 ? 4 : 2; // supersample small sizes harder
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const px = (x + (sx + 0.5) / samples) / size;
          const py = (y + (sy + 0.5) / samples) / size;
          const [cr, cg, cb, ca] = shade(px, py);
          r += cr * ca;
          g += cg * ca;
          b += cb * ca;
          a += ca;
        }
      }
      const n = samples * samples;
      const i = (y * size + x) * 4;
      if (a > 0) {
        rgba[i] = Math.round(r / a);
        rgba[i + 1] = Math.round(g / a);
        rgba[i + 2] = Math.round(b / a);
      }
      rgba[i + 3] = Math.round(a / n);
    }
  }
  return encodePng(size, size, rgba);
}

// ---------------------------------------------------------------- containers

/** ICO with PNG-compressed entries (fine on Windows Vista and later). */
function encodeIco(sizes) {
  const images = sizes.map((size) => ({ size, png: render(size) }));
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  let offset = header.length;
  images.forEach((image, index) => {
    const entry = 6 + index * 16;
    header[entry] = image.size >= 256 ? 0 : image.size;
    header[entry + 1] = image.size >= 256 ? 0 : image.size;
    header[entry + 2] = 0; // palette
    header[entry + 3] = 0; // reserved
    header.writeUInt16LE(1, entry + 4); // colour planes
    header.writeUInt16LE(32, entry + 6); // bits per pixel
    header.writeUInt32LE(image.png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += image.png.length;
  });

  return Buffer.concat([header, ...images.map((image) => image.png)]);
}

/** ICNS with PNG payloads, which macOS 10.7+ accepts for every size we ship. */
function encodeIcns() {
  const entries = [
    ['icp4', 16],
    ['icp5', 32],
    ['icp6', 64],
    ['ic07', 128],
    ['ic08', 256],
    ['ic09', 512],
    ['ic10', 1024],
  ].map(([type, size]) => {
    const png = render(size);
    const head = Buffer.alloc(8);
    head.write(type, 0, 'ascii');
    head.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([head, png]);
  });

  const body = Buffer.concat(entries);
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  head.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([head, body]);
}

// ---------------------------------------------------------------- main

mkdirSync(OUT_DIR, { recursive: true });

const files = {
  '32x32.png': render(32),
  '128x128.png': render(128),
  '128x128@2x.png': render(256),
  'icon.png': render(512),
  'Square30x30Logo.png': render(30),
  'Square44x44Logo.png': render(44),
  'Square71x71Logo.png': render(71),
  'Square89x89Logo.png': render(89),
  'Square107x107Logo.png': render(107),
  'Square142x142Logo.png': render(142),
  'Square150x150Logo.png': render(150),
  'Square284x284Logo.png': render(284),
  'Square310x310Logo.png': render(310),
  'StoreLogo.png': render(50),
  'icon.ico': encodeIco([16, 32, 48, 64, 128, 256]),
  'icon.icns': encodeIcns(),
};

for (const [name, data] of Object.entries(files)) {
  writeFileSync(resolve(OUT_DIR, name), data);
}

console.log(`wrote ${Object.keys(files).length} icon files to src-tauri/icons`);
