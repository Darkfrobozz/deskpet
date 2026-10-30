# M0 smoke test — Windows host

Report of an actual `npm run app:dev` run on the Windows host, following
[run-on-windows.md](./run-on-windows.md). Written so the agent working in WSL has the numbers
without re-running the build.

## Environment

| | |
|---|---|
| OS | Windows 11 Home 10.0.26200 (build 26200) |
| CPU | AMD Ryzen 9 3900XT, 12C / 24T |
| RAM | 128 GB |
| Displays | 2 × 1920×1080 @ 100 % |
| Node / npm | v24.19.0 / 11.17.0 |
| Rust | rustc 1.98.1, `stable-x86_64-pc-windows-msvc` |
| MSVC | VS 2022 with C++ workload (linker found) |
| Shell | Git Bash (MINGW64) |

## Build

- `npm install` → 19 packages, 0 vulnerabilities.
- `npx tsc --noEmit` → clean.
- `npm run app:dev` → 346 crates compiled, `Finished dev profile ... in 1m 14s`, then
  `Running target\debug\deskpet.exe`. No Rust warnings/errors, no panic, no `[pet]` log lines.

## What was verified, and how

| Check | Method | Result |
|---|---|---|
| Window has no chrome | screenshot of the window region | pass — no title bar, no border, no shadow |
| Transparency | screenshot over a terminal window | pass — text behind the pet is visible through the window |
| Blob renders at the bottom edge | screenshot | pass — sits on the taskbar edge |
| Sim loop is alive | 3 screenshots 4 s apart | pass — window moved ~570 px right between shots (walking works, and the window tracks the pet) |
| Drag | by hand (user) | pass — window follows the cursor |
| No taskbar button | UI Automation enumeration of `Shell_TrayWnd` | pass — 25 taskbar buttons, none is deskpet |
| `skipTaskbar` wiring | `GetWindowLongPtr(GWL_EXSTYLE)` on the real HWND | see note below |
| Memory stability | private bytes sampled at t=0 and t=60 s | pass — no drift (see table) |

Measured window state (HWND `0x130282`, title `deskpet`, 200×200):

```
style   = 0x14C80000  (VISIBLE, CLIPSIBLINGS, BORDER, SYSMENU, THICKFRAME)
exstyle = 0x00040118  TOPMOST=yes  TOOLWINDOW=no  APPWINDOW=yes  LAYERED=no  TRANSPARENT(click-through)=no
```

Two things worth knowing:

- **`WS_EX_LAYERED` is not set**, yet per-pixel transparency works. So transparency here is DWM
  composition, not a layered window — which means it depends on the compositor, as the spec
  warned for remote sessions / some VMs. Expect that to be the first thing to break there.
- **`WS_EX_APPWINDOW` is set and `WS_EX_TOOLWINDOW` is not**, which is the classic
  "force a taskbar button" combination — yet no taskbar button appears (verified by UIA). So the
  flag does not reflect what `skipTaskbar: true` actually achieved; don't use it as the signal
  that skip-taskbar worked.

## Not verified

These need a human, and were not automated: tray icon + *Show / hide* / *Quit* menu, Alt-Tab
entry while the pet window is focused, focus-stealing on click, mixed-DPI drag across monitors,
walking onto a second monitor, idle → sleep (`z z`), and click → hop + speech bubble (an
automated click was attempted but the harness could not resolve the window, so it never fired).

## Resource usage

60 s sample, app visible and walking, sampled via `Get-Process` CPU-time deltas.

| Scope | Processes | CPU (one core) | CPU (whole 24-thread machine) | Private bytes | Working set |
|---|---|---|---|---|---|
| `deskpet.exe` (Rust shell) | 1 | 11.9 % | 0.5 % | 7.0 MB | 32.7 MB |
| WebView2 children | 6 | 53.4 % | 2.2 % | 243.6 MB | 436.6 MB |
| **app total** | **7** | **65.3 %** | **2.7 %** | **250.6 MB** | **469.3 MB** |
| dev harness (vite + tauri CLI) | 2 | 0.05 % | 0.0 % | 196.7 MB | 154.9 MB |
| **dev total** | **9** | 65.4 % | 2.7 % | 447.3 MB | 624.2 MB |

Threads: 217 across the app; 10 in the Rust shell, 338 handles.

Where the WebView2 CPU goes (20 s sample, per `--type`):

| Process | CPU (one core) | Private |
|---|---|---|
| `gpu-process` | 22.1 % | 72.5 MB |
| `renderer` | 16.3 % | 96.8 MB |
| `browser` | 11.6 % | 46.7 MB |
| `utility: network.mojom.NetworkService` | 1.8 % | 18.1 MB |
| `utility: storage.mojom.StorageService` | 0.0 % | 7.4 MB |
| `crashpad-handler` | 0.0 % | 3.0 MB |

Memory drift over 60 s: Rust shell +0.0 MB, WebView2 −0.9 MB. No growth, so no leak visible at
this granularity; revisit at M1 when a sprite atlas and audio land.

## Findings

1. **65 % of a core steady-state is too much for a desktop pet.** The GPU process (22 %) and
   renderer (16 %) are the bulk: roughly "every 120 Hz sim tick is also a repaint of a
   DWM-composited transparent 200×200 surface". A laptop would lose ~1–2 h of battery to this.
   Worth measuring whether capping the canvas to rAF/60 Hz, and only calling the window-move
   command when the position actually crossed a logical pixel, brings it down. That is a
   simulation/render change in `src/`, not a Rust change.
2. **469 MB working set / 250 MB private at rest is WebView2 baseline**, not deskpet. Nothing to
   fix; just don't be surprised. The Rust shell itself is 7 MB private / 10 threads.
3. The `WS_EX_APPWINDOW`-but-no-taskbar-button result above is a source of confusion for anyone
   re-checking this checklist — it is not a failure.
4. First `tauri dev` build on a warm crate cache of 346 crates took 74 s on this CPU; the docs'
   3–6 min estimate is conservative for a cold cache and slower laptop CPUs.

## Code changes from this session

**None.** No file under `src/`, `src-tauri/`, `tools/`, or `index.html` was edited, and no source
behaviour was changed to make the app run. The only working-tree change produced by running the
app was `npm install` dropping a `"peer": true` line from one transitive dev dependency in
`package-lock.json` (npm 11 churn, not reproducible on other npm versions); that is reverted, not
committed. This report is the only file added by the session.
