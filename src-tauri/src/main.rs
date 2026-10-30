#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! deskpet — Tauri shell.
//!
//! Deliberately tiny. The simulation (state machine, physics, animation timing) lives in
//! TypeScript under `src/core/` so it can run and be debugged in a plain browser. This process
//! owns only what a webview cannot do: move a window, read the global cursor, show a tray icon,
//! and decide when the window is allowed to become visible.

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, WebviewWindow};

/// Logical (CSS px) cursor position in screen coordinates.
///
/// Tauri reports physical pixels; the frontend works in logical ones. Dividing here keeps the
/// DPI conversion in exactly one place.
#[tauri::command]
fn cursor_position(window: WebviewWindow) -> Option<[f64; 2]> {
    let pos = window.cursor_position().ok()?;
    let scale = window.scale_factor().ok()?;
    Some([pos.x / scale, pos.y / scale])
}

/// Move the pet window. Coordinates are logical (CSS px), relative to the virtual desktop.
#[tauri::command]
fn set_pet_window(window: WebviewWindow, x: f64, y: f64) -> Result<(), String> {
    window
        .set_position(tauri::LogicalPosition::new(x, y))
        .map_err(|err| err.to_string())
}

/// Reveal the window once the frontend has painted its first frame (avoids a white flash).
#[tauri::command]
fn ready(window: WebviewWindow) -> Result<(), String> {
    window.show().map_err(|err| err.to_string())?;
    Ok(())
}

/// Debug logging from the webview, which has no console attached in release builds.
#[tauri::command]
fn log(message: String) {
    println!("[pet] {message}");
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let toggle = MenuItem::with_id(app, "toggle", "Show / hide", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit deskpet", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&toggle, &quit])?;

    let mut tray = TrayIconBuilder::with_id("deskpet-tray")
        .tooltip("deskpet")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "quit" => app.exit(0),
            "toggle" => {
                if let Some(window) = app.get_webview_window("pet") {
                    let visible = window.is_visible().unwrap_or(false);
                    let _ = if visible { window.hide() } else { window.show() };
                }
            }
            _ => {}
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }
    tray.build(app)?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            cursor_position,
            set_pet_window,
            ready,
            log
        ])
        .setup(|app| {
            // A missing tray is annoying, not fatal.
            if let Err(err) = build_tray(app.handle()) {
                eprintln!("[pet] tray unavailable: {err}");
            }

            // Safety net: never leave the user with an invisible, unfocusable, unclosable window
            // because the frontend failed to load.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(2500));
                if let Some(window) = handle.get_webview_window("pet") {
                    if !window.is_visible().unwrap_or(true) {
                        let _ = window.show();
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running deskpet");
}
