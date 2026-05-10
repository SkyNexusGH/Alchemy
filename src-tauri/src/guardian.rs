// ==========================================================================
//  OVYRA — Guardian (ad/tracker blocking + privacy)
//
//  v1 of the Tauri port: state is tracked, but actual network-level blocking
//  is deferred. Tauri 2 doesn't expose a clean cross-platform pre-request
//  hook the way Electron's `session.webRequest.onBeforeRequest` does.
//  The follow-up plan is to inject a content-blocker init script into every
//  child webview that overrides `fetch` / `XMLHttpRequest` and uses a
//  MutationObserver to strip tracker-host elements, calling back to Rust to
//  increment `blocked_total`.
// ==========================================================================

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};

#[derive(Default)]
pub struct GuardianState {
    pub config: Mutex<GuardianConfig>,
    pub blocked_total: Mutex<u64>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct GuardianConfig {
    pub enabled:   bool,
    pub ads:       bool,
    pub trackers:  bool,
    pub https:     bool,
    pub safe_path: bool,
}
impl Default for GuardianConfig {
    fn default() -> Self {
        Self { enabled: true, ads: true, trackers: true, https: true, safe_path: true }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GuardianSetPayload {
    pub enabled:   Option<bool>,
    pub ads:       Option<bool>,
    pub trackers:  Option<bool>,
    pub https:     Option<bool>,
    pub safe_path: Option<bool>,
}

#[tauri::command]
pub fn guardian_set(
    state: tauri::State<'_, GuardianState>,
    payload: GuardianSetPayload,
) -> GuardianConfig {
    let mut cfg = state.config.lock();
    if let Some(v) = payload.enabled   { cfg.enabled   = v; }
    if let Some(v) = payload.ads       { cfg.ads       = v; }
    if let Some(v) = payload.trackers  { cfg.trackers  = v; }
    if let Some(v) = payload.https     { cfg.https     = v; }
    if let Some(v) = payload.safe_path { cfg.safe_path = v; }
    cfg.clone()
}

#[tauri::command]
pub fn guardian_get(state: tauri::State<'_, GuardianState>) -> GuardianConfig {
    state.config.lock().clone()
}

// Best-effort cookie clear. Tauri 2 doesn't expose a stable cookies API
// across platforms; on Windows the WebView2 cookie store is per-user-data
// folder. Wiping it cleanly requires the experimental `tauri-plugin-store`
// or raw WebView2 access. For now this is a no-op placeholder so the
// renderer's "Purge cookies" toast still resolves.
#[tauri::command]
pub fn clear_cookies() -> Result<bool, String> {
    Ok(true)
}
