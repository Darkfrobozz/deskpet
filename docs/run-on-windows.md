# Running M0 on Windows

M0 is the go/no-go gate: it proves the stack (Tauri window + TS simulation) works as a real
transparent desktop window on Windows. Two commands:

```powershell
npm install
npm run app:dev
```

`app:dev` runs `tauri dev`, which starts Vite, builds the Rust shell, and opens the window.
First build pulls ~500 crates: expect 3–6 minutes. Later builds are ~10–20 s.

## Prerequisites

| Need | Check | If missing |
|---|---|---|
| Node 20+ | `node -v` | https://nodejs.org |
| Rust + MSVC toolchain | `rustc -V`, `rustup show` | `winget install Rustlang.Rustup` then `rustup default stable-x86_64-pc-windows-msvc` |
| MSVC C++ build tools | VS 2022 with "Desktop development with C++" | `winget install Microsoft.VisualStudio.2022.BuildTools --override "--add Microsoft.VisualStudio.Workload.VCTools"` |
| WebView2 runtime | `Get-AppxPackage *WebView2*` | Preinstalled on Windows 11; else https://developer.microsoft.com/microsoft-edge/webview2/ |

If `cargo` is not on PATH after installing rustup, reopen the terminal.

## Pass criteria

Look at the window that appears in the bottom-centre of the screen:

- [ ] **No window chrome** — no title bar, no border, no shadow.
- [ ] **Transparent** — you see the desktop/wallpaper through it, not a black or white square.
- [ ] **A blob** sits on the bottom edge of the screen (above the taskbar), blinking, and
      occasionally looking at your mouse.
- [ ] **It moves on its own** — every few seconds it walks left or right in short bursts,
      flipping to face the direction it walks.
- [ ] **Click it** — it hops, squashes on landing, and a speech bubble appears.
- [ ] **Drag it** — the window follows the cursor; release and it falls back to the bottom and
      bounces.
- [ ] **No taskbar button, no Alt-Tab entry** for the window.
- [ ] **Clicking it does not steal focus** from whatever you were typing in.
- [ ] **Tray icon** in the notification area with a right-click menu: *Show / hide*, *Quit deskpet*.
- [ ] Quitting via the tray makes the process exit (check Task Manager).

Nice-to-have checks:

- [ ] Move it to a second monitor → it keeps walking, stays clamped to that monitor.
- [ ] With two monitors at different scale factors (e.g. 100 % / 150 %), drag it across the
      boundary → it should not jump or resize the pet.
- [ ] Let it idle for a minute → it eventually curls up and shows `z z` (sleep state).

## Debugging

Press `D` inside the window to toggle the debug overlay: hit box, foot anchor, window frame.
The window has no console; frontend errors show in a `tauri dev` terminal for Rust and nowhere
for JS, so if the blob is missing, run `npm run dev` in a browser first — no `__TAURI_INTERNALS__`
means the same code boots the playground host over a fake desktop.

| Symptom | Likely cause |
|---|---|
| White/black rectangle instead of transparent | `transparent: true` missing, or the OS compositor (remote desktop sessions, some VMs) does not do per-pixel alpha |
| Window invisible for 2.5 s then appears | Expected on first load: the window is created hidden and revealed by the `ready` command after the first paint. The Rust side force-shows it after 2.5 s as a safety net |
| Window never appears | Frontend failed to boot. Check the `tauri dev` output, then run `npm run dev` and open http://localhost:5173 |
| Blob renders but nothing happens on click | Pointer events not reaching the webview, or the whole window is being ignored (`set_ignore_cursor_events`). Nothing in M0 sets it |
| Tray icon missing | `bundle.icon` did not embed; run `npm run icons` and rebuild |
| `error while running tauri application: configuration file not found` | Run from the repo root, not from `src-tauri/` |
| `linking failed` / `LINK : fatal error LNK1181` | MSVC C++ workload missing |

## What to report back

1. The exact output of `npm run app:dev` (tail) if it fails.
2. The pass/fail checklist above.
3. Any of: transparency quality, blurry or aliased art at 150 % scaling, 1-px shimmer while
   walking, drag feeling laggy (the drag loop is cursor-polling at ≤60 Hz plus a fixed 120 Hz
   sim — latency reports matter).

## Release build (optional for M0)

```powershell
npm run app:build
```

Produces `src-tauri/target/release/deskpet.exe` and an NSIS installer under
`src-tauri/target/release/bundle/nsis/`. Unsigned, so SmartScreen will complain.
