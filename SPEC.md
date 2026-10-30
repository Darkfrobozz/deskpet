# Desktop Pet — Specification

Status: draft v0.1 · Owner: darkfrobozz

A small, always-on-top companion that lives on the desktop: walks around, reacts to
being dragged and clicked, sleeps when you're idle, occasionally says something.
Windows is the primary target, macOS is a committed second target, Linux is a
best-effort stretch goal.

---

## 1. Goals & non-goals

### v1 goals
- Transparent, frameless, always-on-top window with a single animated pet.
- No taskbar/dock entry, no focus stealing, tray icon to quit/configure.
- Animation state machine + lightweight physics (walk, idle, drag, throw, fall, land, sleep).
- Survives across multiple monitors and DPI changes.
- Clicking through the empty (transparent) area of the window.
- Fast iteration loop from WSL; shippable signed-ish builds for Windows and macOS.

### The pet: a shrimp

The target character is a **shrimp**, not a generic blob. Reference illustration:
[`assets/pets/shrimp/reference.png`](assets/pets/shrimp/reference.png).

Side view, facing right by default: curved segmented carapace in orange-red with pale highlights,
long swept-back antennae, one visible eye, fan tail at the bottom rear. `facing` is handled by
mirroring the sprite.

Behavioural brief — what each state should *read* as:

| State | Read |
|---|---|
| `idle` | antennae sway, carapace breathes, occasional blink; tail tucked under |
| `walk` | scuttles sideways in short bursts, tail curled, antennae trailing |
| `sleep` | curls into a tight comma, antennae folded, `z` marks |
| `drag` | dangles from the cursor, tail hanging, antennae whipping |
| `fall` | tumbles, antennae streaming upward |
| `land` | flattens on impact, antennae overshoot then settle |
| `happy` | small hop, tail flick, eye squints |

Art requirements:

- Side view, **transparent background**, consistent scale, pivot at the tail/ground contact point.
- Sprite sheet, one row per state, frames left→right: `idle` 4–6, `walk` 6–8, `sleep` 2,
  `drag` 2, `fall` 1, `land` 2, `happy` 3. Drawn at 24–32 px per frame, exported at 4× for HiDPI.
- **The antennae are the character.** They must be separable from the body (own layer, or their
  own row) so they can be procedurally lagged and swayed instead of purely frame-animated.

What the current reference is *not*: it is a flattened screenshot — opaque pink field
(`#f6ced7`) inside a dark frame, no alpha, one pose. Turning it into a pet needs alpha
extraction (chroma key / manual mask), frame slicing, and pivot metadata. That is M1 work;
**M0 deliberately ships a procedural placeholder so code never blocks on art**, and the
placeholder is replaced by the shrimp sheet behind the same `Renderer` interface.

Longer term (M5) this character is a strong candidate for **Live2D** (mesh-warped antennae and
tail is exactly what it is good at) or **Rive** (state machine authored in-graph). The
`Renderer` interface exists so that is a swap, not a rewrite.

### Non-goals for v1
- Fullscreen/exclusive-mode game overlay.
- Linux Wayland support (technically blocked, see §5).
- Interacting with other windows (sitting on title bars, stealing windows). Planned v2.
- AI chat / LLM backend (v2+, protocol-sized hook only).
- Plugin system, marketplace, multiple pets on screen simultaneously.

---

## 2. Tech stack

### Decision: Tauri v2 (Rust shell) + TypeScript webview frontend

| Layer | Choice | Why |
|---|---|---|
| Window shell | **Tauri v2** | ~6–10 MB binary, ~40–80 MB RSS idle. Always-resident app — Electron's 150 MB/250 MB is a poor fit. Native Win32/Cocoa access from Rust for the window flags that actually matter (click-through, no-activate, toolwindow, NSPanel levels). |
| App logic / sim | **TypeScript** | Runs 1:1 in a plain browser → the whole pet brain is testable and iterable without any native build (see §6). |
| Build tool | **Vite** | Instant HMR, two entry points (`index.html` for the webview, `playground.html` for the dev harness). |
| UI framework | **none** (vanilla TS + DOM) | The pet is canvas-only; settings panel is a handful of controls. No framework = no startup cost, no upgrade treadmill. Add Svelte later if settings grow. |
| Renderer | **Canvas2D** first, `Renderer` interface behind it | One pet + sprite sheets doesn't need WebGL. Interface allows PixiJS (particles/effects) or Live2D/Rive later without touching the sim. |
| Assets | Sprite sheet + `pet.json` (animations, FSM, physics params) | Data-driven pet definitions; placeholder art first, real shrimp art later without code changes. |
| Package manager | **pnpm** via corepack | Fast, disk-efficient, both OSes already have corepack. |

### Considered and rejected

- **Electron** — best-click-through API (`setIgnoreMouseEvents({forward:true})`), zero Rust,
  fastest to a working demo. Rejected on footprint for an always-on app, and because
  per-pixel hit-testing, `WS_EX_NOACTIVATE`, and `NSPanel` fullscreen-space behavior
  still require native addons — i.e. it doesn't actually remove the native work.
  *Fallback path:* the architecture in §3 keeps the sim renderer-agnostic, so porting the
  shell to Electron later is a `host/` implementation, not a rewrite.
- **Native (WPF/WinUI, SwiftUI, Qt)** — best possible integration, but two or three
  separate implementations. Contradicts the cross-platform requirement for a solo project.
- **Flutter desktop** — viable, but weaker transparent-window/click-through story and the
  animation/art tooling for this kind of app is worse than the web's.
- **PySide6** — packaging and startup time both worse than the webview options.

### Why Rust-native window control is not optional
These behaviors are unreachable from a webview and are core to the product:

- Windows: `WS_EX_LAYERED | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_TRANSPARENT`,
  `HWND_TOPMOST`, `WM_MOUSEACTIVATE → MA_NOACTIVATE`, per-monitor-v2 DPI.
- macOS: `LSUIElement` + `NSApplicationActivationPolicyAccessory`, `NSWindow.level`,
  `collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary]`,
  `ignoresMouseEvents`, `hidesOnDeactivate = false`.

---

## 3. Architecture

```
┌──────────────────────────── Tauri app (one process) ────────────────────────────┐
│  Rust: src-tauri/                                                               │
│   ├─ platform/  trait Platform ── windows.rs | macos.rs | linux.rs (stub)       │
│   │     window flags, always-on-top, no-activate, click-through,                │
│   │     cursor pos, monitor/work-area enumeration, active window, DPI events    │
│   ├─ tray.rs, autostart.rs, hotkeys.rs, persistence.rs                          │
│   └─ bridge.rs  → emits OS events to the webview, applies window mutations       │
│                                                                                 │
│           ▲ events (pet://cursor, pet://monitors, pet://drag)                    │
│           ▼ commands (set_position, set_clickthrough, say, quit)                 │
│                                                                                 │
│  Webview: src/                                                                  │
│   ├─ core/       PURE TS — zero DOM, zero Tauri                                 │
│   │     fsm.ts (data-driven state machine), physics.ts, pet.ts (sim tick),      │
│   │     types.ts, platform.ts (PlatformHost interface)                          │
│   ├─ render/     canvas2d sprite renderer, atlas loader, Renderer interface      │
│   ├─ ui/         speech bubble, context menu, settings                           │
│   ├─ host/       tauri.ts | browser.ts  ← the ONLY platform-aware code          │
│   └─ main.ts                                                                │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Layering rules (the ones that keep this maintainable)

1. `core/` imports nothing from `render/`, `ui/`, `host/`. Pure functions in, state out.
   → unit-testable with vitest, and runs in Node.
2. `core/` never calls `tauri` APIs. It reads a `PlatformHost` interface:
   ```ts
   interface PlatformHost {
     cursor(): Vec2;
     workAreas(): Rect[];            // multi-monitor
     dragEvents(): AsyncIterable<DragSample> | EventSource<DragSample>;
     activeWindow?(): ActiveWindow | null;
     window: { move(x: number, y: number): void; setClickThrough(on: boolean): void };
     say(text: string): void;
   }
   ```
   Two implementations: `browser.ts` (fake desktop for the playground) and `tauri.ts`.
3. **The simulation lives in TypeScript and is authoritative.** Rust owns only OS facts.
   The sim produces a `window position` each tick; Rust applies it. This is what makes the
   browser playground a faithful mirror of the real thing.
4. **Tick loop is single-owner.** `requestAnimationFrame` in the webview drives sim + render;
   Rust pushes OS events asynchronously. Never two writers to the same state.

### Tick & IPC budget
- 60 Hz rAF loop. Position updates: batched to ≤1 command per frame, skipped when the pet is
  at rest (`dirty` flag). Target <0.3 ms of IPC per frame; measure in M1, and if Tauri IPC is
  the bottleneck, fall back to Rust reading a shared atomic position (documented escape hatch).
- Rendering: sprite sheet with integer-snapped blits for crisp pixels; device-pixel-ratio aware.

### Asset / pet definition (`assets/pets/<id>/`)
```
pet.json
  meta      { id, name, version, author, license, artCredit }
  sprite    { image, frameW, frameH, originX, originY }
  animations{ idle: {frames:[0..3], fps:6, loop:true}, walk: {...}, ... }
  fsm       { states, transitions: [{from, to, weight?, when?: trigger}], 
              triggers: { onGround, isDragged, idleMs > 120000, ... } }
  physics   { walkSpeed, gravity, throwDamping, friction, jumpImpulse }
  eyeTrack  { headAnchor, maxOffset }        // optional cursor-following
```
Sim code contains no pet-specific constants — swapping art + JSON is a new pet.

### State machine (v1 states)
`idle · walk · run · sit · sleep · drag · fall · land · react_happy · react_angry · say`
Transition sources: **(a)** weighted random timers while grounded, **(b)** triggers
(grabbed, released, thrown, cursor nearby, user idle > N min), **(c)** animation completion.
Implemented as a small typed data-driven FSM; every transition is loggable for debugging.

---

## 4. Platform integration matrix

| Capability | Windows 10/11 | macOS 12+ | Linux X11 | Linux Wayland |
|---|---|---|---|---|
| Frameless + transparent window | `WS_EX_LAYERED` / Tauri `transparent` | Tauri `transparent` + `macOSPrivateApi: true` | ✔ (per-pixel alpha needs a compositor) | ✘ client-side only |
| Always on top | `HWND_TOPMOST` + `SWP_NOACTIVATE` | `NSWindow.level = .floating` | `_NET_WM_STATE_ABOVE` | ✘ no global ordering |
| Above fullscreen apps | only borderless-windowed fullscreen | `.screenSaver` level + `.fullScreenAuxiliary` + non-activating panel | partial | ✘ |
| No taskbar / dock / alt-tab entry | `WS_EX_TOOLWINDOW` | `LSUIElement=1` + `Accessory` policy | `_NET_WM_WINDOW_TYPE_UTILITY` | partial |
| No focus steal on click | `WS_EX_NOACTIVATE` + `MA_NOACTIVATE` | non-activating `NSPanel` style | `override_redirect`-ish | ✘ |
| Click-through transparent pixels | ✔ per-pixel via hit-test | `ignoresMouseEvents` | XShape input region | ✘ |
| Cursor position | `GetCursorPos` | `NSEvent.mouseLocation` (no permission) | XQueryPointer | ✘ (needs portal) |
| Multi-monitor / work areas | `EnumDisplayMonitors` | `NSScreen.screens` | ✔ Xrandr | ✘ |
| Live DPI / scale change | `WM_DPICHANGED` | `NSWindowDidChangeBackingProperties` | ✔ | partial |
| Global hotkeys | `RegisterHotKey` | Carbon `RegisterEventHotKey`, **no permission** | XGrabKey | ✘ |
| Autostart | `HKCU\...\Run` | `SMAppService` / LaunchAgent | `.desktop` in autostart | ✔ |
| Active window info | `GetForegroundWindow` + `GetWindowText` (no permission) | needs **Screen Recording** permission for titles | `_NET_ACTIVE_WINDOW` | ✘ |
| Global input hooks | `WH_MOUSE_LL` (no permission) | needs **Accessibility** permission | XRecord | ✘ |
| Tray icon | ✔ | menubar item | ✔ | appindicator |

**Priority: Windows → macOS → Linux/X11 (stretch). Wayland is explicitly out of scope** —
there is no protocol for global window positioning, so a desktop pet cannot work there
without a compositor plugin. Linux builds will refuse to run under Wayland with a clear message.

### Click-through strategy
- **v1:** rectangle hit-test. The window is small (≈ pet size + padding). Rust polls the cursor at
  30 Hz (cheap, no permissions anywhere) and toggles `set_ignore_cursor_events()` as the cursor
  enters/leaves the pet's opaque bounding rects, which the sim publishes on state change.
  Good enough, portable, and testable.
- **v2:** per-pixel alpha-mask hit-test. Windows: `WS_EX_LAYERED` + `WM_NCHITTEST`/`HTTRANSPARENT`
  with a cached bitmap alpha mask. macOS: `NSWindow.ignoresMouseEvents` driven by the same mask.
- Rationale for not over-engineering v1: mouse *hooks* on macOS cost an Accessibility prompt, and
  per-pixel Windows layered windows bypass webview compositing — both are v2 problems.

### Multi-monitor
- v1: **one window**, moving across monitors; work areas enumerated from Rust; sim clamps the pet
  to the union of work areas with per-monitor edge behavior.
- DPI: JS works in logical units; Rust converts at the boundary. A `ScaleFactorChanged` event
  re-derives the pet's logical size and re-clamps position. Test explicitly (moving between a
  100 % and 150 % monitor is the #1 source of "pet teleports" bugs).
- v2: one window per monitor (independent pets, better DPI isolation, N× webview memory).

### Permissions & user trust
- Windows: **no** permissions needed for anything in v1/v2 on the roadmap.
- macOS v1 (window, cursor, tray, hotkeys): **no** permissions.
- macOS v2 window-aware features: Screen Recording (TCC) + Accessibility (TCC). Signed,
  stable `bundle identifier` required, otherwise TCC grants reset on every rebuild.
- Nothing talks to the network in v1. Ship with a plain statement of that.

---

## 5. Distribution

- **Windows:** NSIS `.exe` installer + portable zip. Unsigned → SmartScreen warning
  ("More info → Run anyway" docs for users). Optional later: Azure Trusted Signing.
- **macOS:** `.dmg`, universal binary (arm64 + x64). Ad-hoc signed builds trigger Gatekeeper →
  document `xattr -dr com.apple.quarantine` for testers. Real distribution needs a Developer ID
  ($99/yr) + notarization.
- **Installers are built in CI only** (GitHub Actions `windows-latest`, `macos-latest`).
  macOS builds are impossible anywhere but macOS — this is a hard constraint, plan for it now.
- Auto-update (Tauri updater) is out of scope for v1; the update server + signing keys are v2.

---

## 6. Development environment: WSL + Windows

### The problem
WSL is Linux. The app's *UI* is portable web tech, but its *window behavior* is Windows-native
and can only be verified on the Windows desktop. Running the Linux build under WSLg does **not**
substitute: WSLg composites through a remote protocol, and transparent windows there render
black/opaque — the single most important visual property of the app is untestable in WSLg.

### The resolution: three lanes, one repo (kept in WSL ext4 for IO speed)

**Lane A — UI & sim iteration (99 % of the work, zero native build).**
```
WSL:  npm run dev         # Vite on 0.0.0.0:5173
Win:  browser → http://localhost:5173
```
WSL2 forwards localhost, so the Windows browser reaches the WSL dev server. There is one entry
point (`index.html`); the app detects the host at runtime — no `__TAURI_INTERNALS__` means it
boots the `browser.ts` host, which fakes a desktop (wallpaper + taskbar + a draggable 200×200
"window" div with a dashed outline). Same `core/` code, same window-move code path, so window
position bugs are visible in the browser. Drag, throw, physics, FSM, animation timing, bubble
layout — all tuned here with HMR.

**Lane B — real Windows window behavior, cross-compiled from WSL.**
```
WSL:  pnpm win:build      # vite build → cargo xwin build --target x86_64-pc-windows-msvc
      pnpm win:run        # copies to /mnt/c/pet-dist/pet.exe and launches it
```
`cargo-xwin` (already installed here) downloads the MSVC CRT + Windows SDK and links with
`clang`/`llvm-lld`, so no MSVC on the WSL side is required. Output is copied to
`/mnt/c/pet-dist/` (not run from the 9P share) and launched via WSL interop — the window
appears on the Windows desktop. Loop cost ≈ 5–20 s incremental.
The exe is configured with `devUrl = http://localhost:5173` in dev builds, so **HMR still works
inside the real window** — change a sprite in WSL, watch the native pet update live.
*Risk to verify in M0:* Tauri's dev-vs-prod asset selection under cross-compilation; fallback is
`devUrl` → built assets with a full rebuild per change.

**Lane C — native Windows build (escape hatch only).**
If a Rust dependency refuses to cross-compile: `pushd \\wsl.localhost\Ubuntu-24.04\home\darkfrobozz\pet`
in `cmd`, build with the Windows toolchain (VS2022 + WebView2 already present). Note `cmd.exe`
refuses a UNC cwd without `pushd`, and node/rust IO over the 9P share is slow — use it to unblock,
then move the offending build to CI.

**Lane D — CI.** Both installers on GitHub Actions; macOS via `macos-latest`. Also the first
place a real macOS binary ever runs.

### Toolchain notes (verified on this machine)
| | WSL side | Windows side |
|---|---|---|
| packages | pnpm via `corepack enable` | — |
| web | node 24.11, vite | node 24.19 (browser only) |
| rust→win | rust 1.97, target `x86_64-pc-windows-msvc`, `cargo-xwin`, clang 22 + `llvm-lib` ✔ | WebView2 runtime ✔, VS2022 ✔ |
| rust→linux | webkit2gtk-4.1 ✔ (Linux build for sanity checks only) | n/a |

Gotchas to encode in `tools/`:
- Always `cd` to a real Windows path before invoking `cmd.exe`/`powershell.exe` from WSL (UNC cwd).
- `cmd.exe`/`powershell.exe` are not on `$PATH` here — the scripts add `/mnt/c/Windows/System32`.
- Do not put `node_modules/` or `target/` on `/mnt/c` — Windows tools read it fine, but the
  reverse (WSL tools on NTFS) is painfully slow. Keep the repo in ext4, copy only artifacts out.

---

## 7. Repo layout

```
pet/
├─ SPEC.md                  ← this file
├─ docs/                    ADRs, click-through notes, release runbook
├─ package.json             scripts: dev, build, win:build, win:run, test, lint
├─ vite.config.ts           single entry (no framework plugin)
├─ index.html               webview entry; browser mode becomes the playground
├─ assets/pets/shrimp/      reference.png (goal character), sprite sheet + pet.json later
├─ src/
│  ├─ core/                 math.ts profile.ts pet.ts types.ts (pure TS, no DOM)
│  ├─ render/               canvas2d.ts (procedural placeholder; atlas.ts in M1)
│  ├─ ui/                   bubble.ts (menu.ts, settings.ts later)
│  ├─ host/                 types.ts index.ts browser.ts tauri.ts
│  ├─ style.css
│  └─ main.ts
├─ src-tauri/
│  ├─ tauri.conf.json       transparent, decorations:false, skipTaskbar, alwaysOnTop
│  ├─ Cargo.toml
│  ├─ src/main.rs
│  ├─ src/platform/{mod,windows,macos,linux}.rs
│  └─ src/{bridge,tray,autostart,hotkeys,persistence}.rs
└─ tools/                   win-build.sh, win-run.sh, atlas.py (optional)
```

---

## 8. Milestones

**M0 — Walking skeleton (proves the risky parts, nothing pretty).**
- Scaffold Tauri v2 + Vite + TS; `index.html` transparent/frameless/always-on-top/skip-taskbar.
- Tray icon with "Quit" and "Settings". Placeholder pet drawn procedurally (no art dependency).
- Draggable via pointer events; position clamped to the work area.
- **Prove Lane B end-to-end:** `pnpm win:build && pnpm win:run` → a transparent pet on the
  real Windows desktop. This is the go/no-go gate for the whole stack choice.
- *Exit criteria:* transparent window visible on Windows, no taskbar entry, no focus steal,
  builds from WSL in <60 s cold / <20 s incremental.

**M1 — Sim & renderer + shrimp art.** Sprite atlas loader, `Renderer` interface, FSM, physics,
screen-edge behavior, idle→walk→sleep cycles, vitest coverage on `core/`, animation hot-reload.
Art: key the pink out of `reference.png`, draw the shrimp sprite sheet (or commission it), wire
`pet.json`, and delete the procedural blob once the shrimp reads better.

**M2 — Interaction & OS integration.** Drag/throw with momentum, click reactions, speech
bubbles, right-click context menu, user-idle detection → sleep, multi-monitor travel, DPI
change handling, settings persistence, autostart, global hotkey (summon/sleep toggle).

**M3 — Ship Windows.** Rect hit-test click-through, tray polish, single-instance, crash log,
NSIS installer via CI, "install / uninstall / autostart" docs.

**M4 — macOS.** `platform/macos.rs` behind the `Platform` trait, `LSUIElement`, accessory
policy, floating level + all-spaces behavior, menubar item, universal dmg in CI.

**M5 — Optional magic.** Element of choice: window-aware behaviors (sit on the active window's
title bar — needs Screen Recording permission on macOS) · eye tracking · Live2D/Rive renderer ·
LLM chat with a bubble UI · pet pack format + sharing.

---

## 9. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Tauri cross-compile from WSL hits a dependency that needs MSVC | blocks Lane B | Verify in M0 before writing features; escape to Lane C/CI; worst case the shell becomes native-Windows-built and WSL owns only web assets |
| Transparent + no-activate + click-through is a partly-unsupported combination on Win32 | mouse events swallowed or focus stolen | Prototype the exact flag combination in M0; `MA_NOACTIVATE` handling; keep a documented fallback (whole-window hit-test, no `NOACTIVATE`) |
| Dev/prod asset selection under cross-compilation | no HMR in the native window | Fall back to full rebuilds (~20 s) or `pnpm build && copy` hot-swap of dist |
| DPI changes across monitors | pet teleports / wrong size | Explicit test matrix, logical-unit convention enforced at the Rust boundary |
| macOS TCC permissions (v2 features) | features silently unavailable | Ship v1 permission-free; request lazily with in-app explanation, stable bundle id |
| Art availability | blocked early | Procedural placeholder pet in M0; art is a swappable asset pack |
| Signing/notarization cost | gatekeeper friction for testers | Documented ad-hoc sign + quarantine-strip instructions until real certs exist |

---

## 10. Open questions

1. ~~**Pet concept**~~ — settled: a shrimp (`assets/pets/shrimp/reference.png`). Open: do we
   commission the sprite sheet, adapt the reference ourselves, or keep the procedural
   placeholder until later?
2. **Pixel art or vector/Live2D?** Sprite sheets are cheapest to ship; Live2D makes the
   antennae and tail genuinely alive but adds a WebGL renderer and a license to consider.
   Note the reference is flat vector-ish art, not pixel art — a flat sprite sheet and a
   Live2D rig both fit it, pixel art would require a redraw (and loses the antennae detail).
3. **Personality features** — does it need speech at all in v1, or purely animation + reactions?
4. **Does it need to react to the OS** (active window, battery, time of day, music) in v1? That
   determines whether we need permissions early.
5. **Windows-first release, macOS later** — is M4 (macOS) allowed to slip, or should the
   `Platform` trait be hardened earlier with a stubbed macOS build in CI?
6. **Electron fallback pre-approved?** If M0 shows Tauri cross-compile is hostile, do we accept
   Electron (~10× footprint) or push through with native Windows builds?
