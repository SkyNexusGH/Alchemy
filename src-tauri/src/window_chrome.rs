// ==========================================================================
//  OVYRA — Window chrome (taskbar auto-hide fix on maximize)
//
//  Same pattern as Electron version: when the user maximizes the window,
//  resize to the monitor's work_area minus 1px on the bottom edge so an
//  auto-hidden Windows taskbar can still reveal on hover.
// ==========================================================================

use tauri::{Runtime, WindowEvent, PhysicalPosition, PhysicalSize};

pub fn install<R: Runtime>(win: &tauri::WebviewWindow<R>) {
    let win_clone = win.clone();
    win.on_window_event(move |event| {
        if let WindowEvent::Resized(_) = event {
            // Native maximize state means the window covers the entire monitor,
            // including the taskbar's reserved zone — Windows then refuses to
            // reveal the auto-hidden taskbar. Reshape to work_area minus 1px.
            if win_clone.is_maximized().unwrap_or(false) {
                if let Some(monitor) = win_clone.current_monitor().ok().flatten() {
                    let pos  = monitor.position();
                    let size = monitor.size();
                    // Conservative work_area approximation: shave 1px off the
                    // bottom edge. Windows treats this as "not fullscreen" and
                    // the taskbar reveal returns.
                    let _ = win_clone.unmaximize();
                    let _ = win_clone.set_position(PhysicalPosition::new(pos.x, pos.y));
                    let _ = win_clone.set_size(PhysicalSize::new(size.width, size.height.saturating_sub(1)));
                }
            }
        }
    });
}
