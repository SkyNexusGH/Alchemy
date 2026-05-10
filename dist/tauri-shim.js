/* ==========================================================================
   OVYRA — Tauri shim
   Builds the `window.ovyra` object the renderer expects, mapping every
   call to a Tauri `invoke()` / window-API equivalent. This is the entire
   bridge between the existing renderer code and the new Rust main process.
   ========================================================================== */

(() => {
  const T = window.__TAURI__;
  if (!T) {
    console.error('[Ovyra] Tauri runtime not available — window.__TAURI__ is missing.');
    return;
  }

  const invoke = T.core.invoke;
  const listen = T.event.listen;

  // Resolve the current Tauri window across API variants.
  const win =
    (T.window && T.window.getCurrentWindow && T.window.getCurrentWindow()) ||
    (T.window && T.window.getCurrent && T.window.getCurrent()) ||
    null;

  window.ovyra = {
    // ----- Tabs -----
    tabCreate:        (url)             => invoke('tab_create',        { url }),
    tabClose:         (id)              => invoke('tab_close',         { id }),
    tabShow:          (id, pane)        => invoke('tab_show',          { id, pane }),
    tabHide:          (pane)            => invoke('tab_hide',          { pane }),
    tabNavigate:      (id, url)         => invoke('tab_navigate',      { id, url }),
    tabBack:          (id)              => invoke('tab_back',          { id }),
    tabForward:       (id)              => invoke('tab_forward',       { id }),
    tabReload:        (id)              => invoke('tab_reload',        { id }),
    tabSleep:         (id)              => invoke('tab_sleep',         { id }),
    tabWake:          (id)              => invoke('tab_wake',          { id }),
    viewportBounds:   (pane, bounds)    => invoke('viewport_bounds',   { pane, bounds }),
    viewsSetVisible:  (visible)         => invoke('views_set_visible', { visible }),

    // ----- Sidebar app webviews -----
    appShow:          (appId, url)      => invoke('app_show',          { appId, url }),
    appHide:          (appId)           => invoke('app_hide',          { appId }),
    appHideAll:       ()                => invoke('app_hide_all'),
    appClose:         (appId)           => invoke('app_close',         { appId }),
    appBounds:        (appId, bounds)   => invoke('app_bounds',        { appId, bounds }),

    // ----- Window controls -----
    winMinimize:      () => win && win.minimize(),
    winMaxToggle:     () => win && win.toggleMaximize(),
    winClose:         () => win && win.close(),

    // ----- Guardian / privacy -----
    guardianSet:      (cfg)             => invoke('guardian_set', { payload: cfg }),
    guardianGet:      ()                => invoke('guardian_get'),
    clearCookies:     (_hostnames)      => invoke('clear_cookies'),

    // ----- Misc -----
    openExternal:     (url) => {
      if (T.shell && T.shell.open) return T.shell.open(url);
      window.open(url, '_blank');
    },
    metrics:          () => invoke('stats_metrics'),

    // ----- Event subscription -----
    on: (channel, cb) => {
      let unsub = null;
      listen(channel, (e) => cb(e.payload)).then((u) => { unsub = u; });
      return () => { if (unsub) try { unsub(); } catch {} };
    }
  };
})();
