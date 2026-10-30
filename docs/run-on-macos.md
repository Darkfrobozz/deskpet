# Running on macOS

Status: **expected to compile and run, not yet verified.** No macOS host has run this repo. This
document is the prediction plus the exact list of things that will look wrong, so a first macOS
run is a test rather than a surprise.

Same commands as every other platform:

```bash
xcode-select --install    # once: clang + the macOS SDK
corepack enable           # or: npm i -g pnpm — this repo uses npm, so simply skip
npm install
npm run app:dev
```

Then `npm run app:build` produces `src-tauri/target/release/bundle/macos/deskpet.app` and a `.dmg`.

## Why it should compile

Audited at the time of writing:

| Check | Result |
|---|---|
| `tauri` crate features | `tray-icon`, `macos-private-api` — the latter is required for a transparent window and must match `app.macOSPrivateApi` in `tauri.conf.json`; `tauri-build` enforces the pair |
| Rust code | no `#[cfg(windows)]`, no `winapi`/`windows` crate, no native-tls/openssl. Uses `WebviewWindow::cursor_position`, `set_position`, tray — all cross-platform |
| `windows_subsystem` attribute | ignored on non-Windows targets (same as the stock Tauri template) |
| `icons/icon.icns` | valid ICNS, 7 entries (`icp4`…`ic10`), 16→1024 px, declared length matches file length |
| `bundle.targets: "all"` | on macOS resolves to `.app` + `.dmg`; `hdiutil` ships with the OS |
| native deps | none beyond what Tauri itself pulls |

macOS cannot be cross-compiled from WSL or Linux. This has to be built on a Mac (or in CI with
`macos-latest`).

## What will compile but behave wrong

These are the M4 items in [SPEC.md §4](../SPEC.md#4-platform-integration-matrix). They are known,
not surprises:

1. **A Dock icon and a Cmd-Tab entry.** macOS has no taskbar, so `skipTaskbar: true` is a no-op.
   Hiding the app from the Dock and Cmd-Tab needs `LSUIElement = 1` in the bundled `Info.plist`
   (Tauri exposes this as `bundle.macOS.infoPlist` or `app.macOSPrivateApi`-adjacent config) or
   `NSApplication.setActivationPolicy(.accessory)` at startup.
2. **A normal app menu bar**, which is wrong for a pet — you want either no menu or a tray-only
   accessory app.
3. **Clicking the pet will focus/activate the app**, stealing focus from whatever you were typing
   in. Fixing this is the macOS analogue of `WS_EX_NOACTIVATE`: a non-activating `NSPanel`
   (`nonactivatingPanel` style mask), not a plain `NSWindow`.
4. **The window will float over normal windows but not over fullscreen Spaces, and it belongs to
   one Space.** Needs `NSWindow.level = .floating`/`.screenSaver` plus
   `collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary]`.
5. `tauri dev` runs a **bare binary, not a bundle**, so Dock/activation behaviour in dev will differ
   from the bundled `.app`. Test both.

None of these block the walking-skeleton check. They are the macOS half of
[`run-on-windows.md`](./run-on-windows.md)'s pass criteria.

## WKWebView differences (Safari engine, not Chromium)

The frontend runs on WebKit on macOS and WebView2 (Chromium) on Windows. Audited:

| API | Where | Risk |
|---|---|---|
| `CanvasRenderingContext2D.roundRect` | `src/ui/bubble.ts` | Safari 16+ (macOS 12.3+). On older macOS the bubble throws — see the frame guard below |
| `screen.availLeft` / `availTop` | `src/host/tauri.ts` | **Chromium-only.** On WebKit both are `undefined`, so the work-area origin falls back to `(0, 0)`. Correct on a single display; wrong if a second display sits left/above the primary |
| `backdrop-filter` | `src/style.css` (playground only) | needs `-webkit-` prefix; cosmetic, dev-only |
| pointer events, `setPointerCapture`, `ResizeObserver` | `src/host/*` | supported since Safari 13 — fine |
| `screen.availWidth`/`availHeight` | `src/host/tauri.ts` | standard, fine |

Two follow-ups worth doing when macOS becomes real:

- Replace the `screen.*` work-area read with a Rust command that returns
  `Monitor::work_area()` (serialised, so no field-name assumptions) and keep the JS path as a
  fallback. That fixes multi-monitor on **both** platforms.
- Guard `roundRect` with a feature check and fall back to `rect`.

## One fragility found during this audit (already fixed)

`requestAnimationFrame(frame)` used to be the **last statement** in the frame callback, so *any*
exception — a missing canvas API, a bad number, a throw in the renderer — killed the loop
permanently. Combined with a webview that has no visible console in release builds, the symptom
would have been "the pet froze and nothing in the log". It is now `try/catch/finally` with the
reschedule in `finally`, and the first error is forwarded to the Rust `log` command so it lands in
the terminal/`stderr`.

## Signing

- An unsigned `.app` built locally runs fine.
- An unsigned `.app` **downloaded** is quarantined: `xattr -dr com.apple.quarantine deskpet.app`.
- Real distribution needs a Developer ID ($99/yr) + notarization, and `macos-private-api`
  (used for transparency) is a known App Store rejection risk — ship outside the App Store.

## First-run checklist for a Mac

- [ ] `npm run app:dev` builds and the window appears.
- [ ] Transparent, not black/white.
- [ ] No title bar, no shadow.
- [ ] The blob renders and walks.
- [ ] Click → hop + bubble (this exercises `roundRect`, so it is the WebKit canary).
- [ ] Drag follows the cursor; release → falls and lands.
- [ ] Tray/menubar icon with Quit.
- [ ] Then report the five behaviour items above as known-wrong, not as bugs.
