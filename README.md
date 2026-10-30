# deskpet

A small, always-on-top desktop companion: it walks around your desktop, reacts to being
dragged and clicked, and sleeps when you're away.

Tauri v2 (Rust window shell) + TypeScript/Canvas web frontend. Windows first, macOS second,
Linux/X11 best-effort.

> The full design lives in [SPEC.md](./SPEC.md). Read that before contributing.

## Status

M0 — walking skeleton. Nothing works yet.

## Quick start

```bash
corepack enable          # once, for pnpm
pnpm install

# UI / simulation iteration: served from WSL, opened in the *Windows* browser
pnpm dev                 # -> http://localhost:5173/playground.html

# Real Windows window, cross-compiled from WSL
pnpm win:build           # vite build + cargo xwin build --target x86_64-pc-windows-msvc
pnpm win:run             # copies to /mnt/c/pet-dist/ and launches it
```

## Why the weird dev loop?

We develop in WSL but the app is a Windows-native window with a transparent, click-through,
always-on-top surface. WSLg cannot render transparent windows, so the split is:

- **Lane A** — `playground.html` runs the same simulation code in a plain browser over a fake
  desktop. Fast, testable, no native build.
- **Lane B** — the real Windows binary, cross-compiled from WSL with `cargo-xwin` and launched
  via WSL interop, so window behavior is verified on the actual Windows desktop.

See SPEC.md §6 for the full explanation and the toolchain table.

## Layout

| Path | What |
|---|---|
| `src/core/` | Pure TypeScript simulation: FSM, physics, pet tick. No DOM, no Tauri. |
| `src/render/` | Canvas2D sprite renderer behind a `Renderer` interface. |
| `src/host/` | The only platform-aware code: `browser.ts` and `tauri.ts`. |
| `src-tauri/` | Rust window shell + per-OS platform adapters. |
| `assets/pets/` | Pet definitions (`pet.json`) + sprite sheets. |
