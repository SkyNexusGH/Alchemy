// ==========================================================================
//  OVYRA — Tab management (Tauri child Webviews)
// ==========================================================================

use std::collections::HashMap;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, Manager, Runtime,
    LogicalPosition, LogicalSize, WebviewUrl,
    webview::WebviewBuilder,
};

pub const CHROME_UA: &str = concat!(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ",
    "AppleWebKit/537.36 (KHTML, like Gecko) ",
    "Chrome/128.0.0.0 Safari/537.36"
);

// --------------------------------------------------------------------------
//  STATE
// --------------------------------------------------------------------------

#[derive(Default)]
pub struct TabsState {
    pub map: Mutex<HashMap<String, TabInfo>>,
    pub pane_assign: Mutex<PaneAssign>,
    pub viewport_bounds: Mutex<ViewportBounds>,
}

pub struct TabInfo {
    pub url: String,
    pub title: String,
    pub sleeping: bool,
    pub sleep_url: Option<String>,
}

#[derive(Default)]
pub struct PaneAssign {
    pub primary: Option<String>,
    pub secondary: Option<String>,
}

#[derive(Default, Clone, Copy)]
pub struct ViewportBounds {
    pub primary: Option<Bounds>,
    pub secondary: Option<Bounds>,
}

#[derive(Deserialize, Serialize, Clone, Copy, Debug)]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

// --------------------------------------------------------------------------
//  HELPERS
// --------------------------------------------------------------------------

fn rand_id() -> String {
    use rand::distributions::{Alphanumeric, DistString};
    format!(
        "t_{}",
        Alphanumeric.sample_string(&mut rand::thread_rng(), 8).to_lowercase()
    )
}

fn parse_url(s: &str) -> Result<url::Url, String> {
    s.parse().map_err(|e: url::ParseError| format!("bad url '{}': {}", s, e))
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

fn pane_bounds(state: &TabsState, pane: &str) -> Option<Bounds> {
    let vb = state.viewport_bounds.lock();
    match pane { "secondary" => vb.secondary, _ => vb.primary }
}

// Build a Webview with the standard Ovyra config (UA + nav callback that
// emits `tab:url` events back to the renderer). Always attached BEFORE
// `add_child` since on_navigation only exists on the builder.
fn build_tab_view<R: Runtime>(
    app: &AppHandle<R>,
    id: &str,
    url: url::Url,
) -> WebviewBuilder<R> {
    let app_for_cb = app.clone();
    let id_for_cb = id.to_string();
    WebviewBuilder::new(id, WebviewUrl::External(url))
        .user_agent(CHROME_UA)
        .on_navigation(move |new_url| {
            let _ = app_for_cb.emit("tab:url", serde_json::json!({
                "id": id_for_cb,
                "url": new_url.to_string(),
                "canBack": true,
                "canFwd": false,
            }));
            true
        })
}

// --------------------------------------------------------------------------
//  COMMANDS
// --------------------------------------------------------------------------

#[derive(Serialize)]
pub struct TabCreateResponse { pub id: String }

#[tauri::command]
pub async fn tab_create<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, TabsState>,
    url: Option<String>,
) -> Result<TabCreateResponse, String> {
    let id = rand_id();
    let target = url.unwrap_or_else(|| "about:blank".to_string());
    let parsed = parse_url(&target)?;

    let main_win = app.get_window("main").ok_or("main window missing")?;
    let builder = build_tab_view(&app, &id, parsed);

    main_win
        .add_child(
            builder,
            LogicalPosition::new(-10_000.0, -10_000.0),
            LogicalSize::new(800.0, 600.0),
        )
        .map_err(|e| format!("add_child failed: {}", e))?;

    state.map.lock().insert(id.clone(), TabInfo {
        url: target,
        title: "New Tab".into(),
        sleeping: false,
        sleep_url: None,
    });

    Ok(TabCreateResponse { id })
}

#[tauri::command]
pub async fn tab_close<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, TabsState>,
    id: String,
) -> Result<(), String> {
    {
        let mut pa = state.pane_assign.lock();
        if pa.primary.as_deref() == Some(&id) { pa.primary = None; }
        if pa.secondary.as_deref() == Some(&id) { pa.secondary = None; }
    }
    state.map.lock().remove(&id);
    if let Some(view) = app.get_webview(&id) {
        let _ = view.close();
    }
    Ok(())
}

#[tauri::command]
pub async fn tab_show<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, TabsState>,
    id: String,
    pane: Option<String>,
) -> Result<(), String> {
    let pane = pane.unwrap_or_else(|| "primary".to_string());

    let prev = {
        let mut pa = state.pane_assign.lock();
        let prev = match pane.as_str() {
            "secondary" => pa.secondary.take(),
            _ => pa.primary.take(),
        };
        match pane.as_str() {
            "secondary" => pa.secondary = Some(id.clone()),
            _ => pa.primary = Some(id.clone()),
        }
        prev
    };
    if let Some(prev_id) = prev {
        if prev_id != id {
            if let Some(prev_view) = app.get_webview(&prev_id) {
                let _ = prev_view.hide();
            }
        }
    }

    let was_sleeping = {
        let map = state.map.lock();
        map.get(&id).map(|t| t.sleeping).unwrap_or(false)
    };
    if was_sleeping {
        wake_tab_internal(&app, &state, &id).await?;
    }

    if let Some(view) = app.get_webview(&id) {
        let _ = view.show();
        if let Some(b) = pane_bounds(&state, &pane) {
            apply_bounds(&app, &id, b);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn tab_hide<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, TabsState>,
    pane: String,
) -> Result<(), String> {
    let prev = {
        let mut pa = state.pane_assign.lock();
        match pane.as_str() {
            "secondary" => pa.secondary.take(),
            _ => pa.primary.take(),
        }
    };
    if let Some(prev_id) = prev {
        if let Some(view) = app.get_webview(&prev_id) {
            let _ = view.hide();
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn tab_navigate<R: Runtime>(
    app: AppHandle<R>,
    _state: tauri::State<'_, TabsState>,
    id: String,
    url: String,
) -> Result<(), String> {
    let parsed = parse_url(&url)?;
    if let Some(view) = app.get_webview(&id) {
        view.navigate(parsed).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn tab_back<R: Runtime>(app: AppHandle<R>, id: String) -> Result<(), String> {
    if let Some(view) = app.get_webview(&id) {
        let _ = view.eval("history.back()");
    }
    Ok(())
}

#[tauri::command]
pub async fn tab_forward<R: Runtime>(app: AppHandle<R>, id: String) -> Result<(), String> {
    if let Some(view) = app.get_webview(&id) {
        let _ = view.eval("history.forward()");
    }
    Ok(())
}

#[tauri::command]
pub async fn tab_reload<R: Runtime>(app: AppHandle<R>, id: String) -> Result<(), String> {
    if let Some(view) = app.get_webview(&id) {
        let _ = view.eval("location.reload()");
    }
    Ok(())
}

// --------------------------------------------------------------------------
//  SLEEP / WAKE
// --------------------------------------------------------------------------

#[tauri::command]
pub async fn tab_sleep<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, TabsState>,
    id: String,
) -> Result<(), String> {
    {
        let mut map = state.map.lock();
        let Some(tab) = map.get_mut(&id) else { return Ok(()) };
        if tab.sleeping { return Ok(()); }
        tab.sleeping = true;
        tab.sleep_url = Some(tab.url.clone());
    }
    if let Some(view) = app.get_webview(&id) {
        let _ = view.close();
    }
    let _ = app.emit("tab:sleep", serde_json::json!({ "id": id, "sleeping": true }));
    Ok(())
}

#[tauri::command]
pub async fn tab_wake<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, TabsState>,
    id: String,
) -> Result<(), String> {
    wake_tab_internal(&app, &state, &id).await
}

async fn wake_tab_internal<R: Runtime>(
    app: &AppHandle<R>,
    state: &tauri::State<'_, TabsState>,
    id: &str,
) -> Result<(), String> {
    let url = {
        let mut map = state.map.lock();
        let Some(tab) = map.get_mut(id) else { return Ok(()) };
        if !tab.sleeping { return Ok(()); }
        tab.sleeping = false;
        tab.sleep_url.take().unwrap_or_else(|| tab.url.clone())
    };
    let parsed = parse_url(&url)?;
    let main_win = app.get_window("main").ok_or("main window missing")?;
    let builder = build_tab_view(app, id, parsed);
    main_win
        .add_child(
            builder,
            LogicalPosition::new(-10_000.0, -10_000.0),
            LogicalSize::new(800.0, 600.0),
        )
        .map_err(|e| format!("re-add_child failed: {}", e))?;

    let pane = {
        let pa = state.pane_assign.lock();
        if pa.primary.as_deref() == Some(id) { Some("primary") }
        else if pa.secondary.as_deref() == Some(id) { Some("secondary") }
        else { None }
    };
    if let Some(p) = pane {
        if let Some(b) = pane_bounds(state, p) {
            apply_bounds(app, id, b);
        }
    }
    let _ = app.emit("tab:sleep", serde_json::json!({ "id": id, "sleeping": false }));
    Ok(())
}

// --------------------------------------------------------------------------
//  VIEWPORT BOUNDS
// --------------------------------------------------------------------------

#[tauri::command]
pub async fn viewport_bounds<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, TabsState>,
    pane: String,
    bounds: Bounds,
) -> Result<(), String> {
    {
        let mut vb = state.viewport_bounds.lock();
        match pane.as_str() {
            "secondary" => vb.secondary = Some(bounds),
            _ => vb.primary = Some(bounds),
        }
    }
    let assigned = {
        let pa = state.pane_assign.lock();
        match pane.as_str() {
            "secondary" => pa.secondary.clone(),
            _ => pa.primary.clone(),
        }
    };
    if let Some(id) = assigned {
        apply_bounds(&app, &id, bounds);
    }
    Ok(())
}

#[tauri::command]
pub async fn views_set_visible<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, TabsState>,
    visible: bool,
) -> Result<(), String> {
    let ids: Vec<String> = state.map.lock().keys().cloned().collect();
    for id in ids {
        if let Some(view) = app.get_webview(&id) {
            if visible { let _ = view.show(); } else { let _ = view.hide(); }
        }
    }
    Ok(())
}
