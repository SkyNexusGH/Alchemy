// ==========================================================================
//  OVYRA — Sidebar app webviews (Opera-style apps + Echo music sources)
// ==========================================================================

use std::collections::HashMap;
use parking_lot::Mutex;
use tauri::{
    AppHandle, Manager, Runtime,
    LogicalPosition, LogicalSize, WebviewUrl,
    webview::WebviewBuilder,
};

use crate::tabs::{Bounds, CHROME_UA};

#[derive(Default)]
pub struct AppsState {
    pub map: Mutex<HashMap<String, AppEntry>>,
}

pub struct AppEntry {
    pub url: String,
    pub bounds: Option<Bounds>,
    pub visible: bool,
}

fn safe_label(app_id: &str) -> String {
    format!("app__{}", app_id.replace([':', '/', '.', '@'], "_"))
}

fn apply_bounds<R: Runtime>(app: &AppHandle<R>, label: &str, b: Bounds) {
    let Some(view) = app.get_webview(label) else { return };
    let max = app.get_window("main").and_then(|w| w.inner_size().ok());
    let max_w = max.map(|s| s.width as f64).unwrap_or(8000.0);
    let max_h = max.map(|s| s.height as f64).unwrap_or(8000.0);
    let x = b.x.max(0.0);
    let y = b.y.max(0.0);
    let w = (b.width.max(1.0)).min((max_w - x).max(1.0));
    let h = (b.height.max(1.0)).min((max_h - y).max(1.0));
    let _ = view.set_position(LogicalPosition::new(x, y));
    let _ = view.set_size(LogicalSize::new(w, h));
}

#[tauri::command]
pub async fn app_show<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, AppsState>,
    app_id: String,
    url: String,
) -> Result<(), String> {
    let label = safe_label(&app_id);

    // Hide every other app view so only one is visible at a time.
    {
        let mut map = state.map.lock();
        for (other_id, entry) in map.iter_mut() {
            if other_id != &app_id && entry.visible {
                let other_label = safe_label(other_id);
                if let Some(view) = app.get_webview(&other_label) {
                    let _ = view.hide();
                }
                entry.visible = false;
            }
        }
    }

    let needs_create = !state.map.lock().contains_key(&app_id);
    if needs_create {
        let parsed: url::Url = url.parse().map_err(|e: url::ParseError| e.to_string())?;
        let main_win = app.get_window("main").ok_or("main window missing")?;
        let builder = WebviewBuilder::new(&label, WebviewUrl::External(parsed))
            .user_agent(CHROME_UA);
        main_win
            .add_child(
                builder,
                LogicalPosition::new(-10_000.0, -10_000.0),
                LogicalSize::new(400.0, 600.0),
            )
            .map_err(|e| format!("add_child failed: {}", e))?;
        state.map.lock().insert(app_id.clone(), AppEntry {
            url: url.clone(),
            bounds: None,
            visible: true,
        });
    } else {
        if let Some(view) = app.get_webview(&label) {
            let _ = view.show();
        }
        if let Some(entry) = state.map.lock().get_mut(&app_id) {
            entry.visible = true;
        }
    }

    if let Some(b) = state.map.lock().get(&app_id).and_then(|e| e.bounds) {
        apply_bounds(&app, &label, b);
    }
    Ok(())
}

#[tauri::command]
pub async fn app_hide<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, AppsState>,
    app_id: String,
) -> Result<(), String> {
    let label = safe_label(&app_id);
    if let Some(view) = app.get_webview(&label) {
        let _ = view.hide();
    }
    if let Some(entry) = state.map.lock().get_mut(&app_id) {
        entry.visible = false;
    }
    Ok(())
}

#[tauri::command]
pub async fn app_hide_all<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, AppsState>,
) -> Result<(), String> {
    let mut map = state.map.lock();
    for (id, entry) in map.iter_mut() {
        let label = safe_label(id);
        if let Some(view) = app.get_webview(&label) {
            let _ = view.hide();
        }
        entry.visible = false;
    }
    Ok(())
}

#[tauri::command]
pub async fn app_close<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, AppsState>,
    app_id: String,
) -> Result<(), String> {
    let label = safe_label(&app_id);
    if let Some(view) = app.get_webview(&label) {
        let _ = view.close();
    }
    state.map.lock().remove(&app_id);
    Ok(())
}

#[tauri::command]
pub async fn app_bounds<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, AppsState>,
    app_id: String,
    bounds: Bounds,
) -> Result<(), String> {
    let label = safe_label(&app_id);
    let visible = {
        let mut map = state.map.lock();
        if let Some(entry) = map.get_mut(&app_id) {
            entry.bounds = Some(bounds);
            entry.visible
        } else { false }
    };
    if visible {
        apply_bounds(&app, &label, bounds);
    }
    Ok(())
}
