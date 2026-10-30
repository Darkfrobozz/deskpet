# deskpet

> [!WARNING]
> **AI GENERATED CODE — USE AT YOUR OWN RISK**
>
> This repository is written largely or entirely by AI coding agents under human direction.
> It has **not** been audited, security-reviewed, or tested beyond what the commit history shows.
> Expect bugs, incomplete error handling, and designs that looked reasonable to a language model.
>
> Specifically, before using this on a machine you care about:
>
> - **Read the Rust code yourself** before running it. It manipulates window flags, tray icons,
>   and startup behavior. Nothing here has been reviewed by a human with Win32 or Cocoa
>   expertise.
> - **Do not assume anything is private.** No network code exists yet, but nothing enforces that.
> - **Treat the spec as a proposal, not a contract.** Repository code and `SPEC.md` may drift.
> - **No warranty, no support.** See the license (add one if you fork this).
>
> Prompts, agent transcripts, and design discussion are the actual provenance of this code.
> Treat pull requests from humans as the mechanism that upgrades it from "AI generated" to
> "reviewed".

A small, always-on-top desktop companion: it walks around your desktop, reacts to being
dragged and clicked, and sleeps when you're away.

Tauri v2 (Rust window shell) + TypeScript/Canvas web frontend. Windows first, macOS second,
Linux/X11 best-effort.

> The full design lives in [SPEC.md](./SPEC.md). Read that before contributing.

## Status

M0 — walking skeleton. A clickable, draggable blob that wanders the bottom of the screen.
The goal character is a **shrimp** ([reference](./assets/pets/shrimp/reference.png)); M0 uses a
procedural blob placeholder so the code never blocks on art. See SPEC.md §1b.

Platform notes:

- [docs/run-on-windows.md](./docs/run-on-windows.md) — verified smoke test (M0 passed)
- [docs/run-on-macos.md](./docs/run-on-macos.md) — predicted compile + the list of known-wrong
  macOS behaviours (Dock icon, Spaces, focus stealing) before anyone files them as bugs

## Quick start

```bash
npm install
npm run app:dev     # tauri dev: starts vite, builds the shell, opens the real window
```

Iterating on the animation/simulation without touching Rust — this runs the *same*
`src/core` code in a normal browser, over a fake desktop:

```bash
npm run dev         # -> http://localhost:5173
```

Icons are committed but regenerable (no dependencies):

```bash
npm run icons
```

## What works in M0

- Transparent, frameless, always-on-top, taskbar-less 200×200 window.
- A procedurally drawn blob that idles, walks along the bottom of the screen, sleeps, blinks,
  and looks at your cursor.
- Click it → it hops and says something. Drag it → window follows; release → it falls and
  lands with squash-and-stretch.
- Tray icon with "Show / hide" and "Quit".
- Browser playground with a fake desktop, taskbar, and HUD.

## Why the odd split (dev in WSL, run on Windows)

The app is a Windows-native window with a transparent, click-through, always-on-top surface.
WSLg cannot render transparent windows, so testing there is meaningless. Instead:

- **Playground** — `npm run dev`, open in the *host* browser. Same simulation code, no native build.
- **Real window** — `npm run app:dev` on the host OS.

Build/run on the host OS (Windows today, macOS later). Cross-compiling the shell from WSL is a
known-hard path and deliberately not supported yet; see SPEC.md §6.

## Layout

| Path | What |
|---|---|
| `src/core/` | Pure TypeScript simulation: mood FSM, physics, pet tick. No DOM, no Tauri. |
| `src/render/` | Canvas2D renderer (procedural blob placeholder; sprite atlas in M1). |
| `src/ui/` | Speech bubble. |
| `src/host/` | The only platform-aware code: `browser.ts` (playground) and `tauri.ts`. |
| `src-tauri/` | Rust window shell. Deliberately tiny: move window, read cursor, tray, reveal. |
| `tools/` | Build helpers (`gen-icons.mjs`). |
