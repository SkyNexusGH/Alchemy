// ==========================================================================
//  OVYRA — Tauri main process
//  Studio: FiveNova · Creator: SkyNexusHD
// ==========================================================================
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod tabs;
mod apps;
mod guardian;
mod window_chrome;

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(tabs::TabsState::default())
        .manage(apps::AppsState::default())
        .manage(guardian::GuardianState::default())
        .invoke_handler(tauri::generate_handler![
            // Tabs
            tabs::tab_create,
            tabs::tab_close,
            tabs::tab_show,
            tabs::tab_hide,
            tabs::tab_navigate,
            tabs::tab_back,
            tabs::tab_forward,
            tabs::tab_reload,
            tabs::tab_sleep,
            tabs::tab_wake,
            tabs::viewport_bounds,
            tabs::views_set_visible,
            // Apps (sidebar / Echo)
            apps::app_show,
            apps::app_hide,
            apps::app_hide_all,
            apps::app_close,
            apps::app_bounds,
            // Guardian / privacy
            guardian::guardian_set,
            guardian::guardian_get,
            guardian::clear_cookies,
            // Misc
            stats_metrics,
        ])
        .setup(|app| {
            let main_win = app
                .get_webview_window("main")
                .expect("main window must exist at setup");
            window_chrome::install(&main_win);
            // Auto-open devtools in dev so JS errors surface immediately.
            #[cfg(debug_assertions)]
            main_win.open_devtools();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Ovyra failed to start");
}

// --------------------------------------------------------------------------
//  Stats — the renderer only displays `blocked`; the rest are stubs to keep
//  the existing `metrics()` shape stable.
// --------------------------------------------------------------------------
#[tauri::command]
fn stats_metrics(
    tabs: tauri::State<'_, tabs::TabsState>,
    guardian: tauri::State<'_, guardian::GuardianState>,
) -> serde_json::Value {
    let map = tabs.map.lock();
    let total = map.len();
    let sleeping = map.values().filter(|t| t.sleeping).count();
    let blocked = *guardian.blocked_total.lock();
    serde_json::json!({
        "ramMB": 0,
        "cpu": 0,
        "tabCount": total,
        "sleeping": sleeping,
        "blocked": blocked,
    })
}
