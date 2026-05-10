/* ==========================================================================
   OVYRA — Preload bridge
   Exposes a tightly-scoped `window.ovyra` API to the renderer.
   ========================================================================== */

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);
const send   = (channel, payload) => ipcRenderer.send(channel, payload);

const listeners = new Map();
function on(channel, cb) {
  const wrapped = (_e, data) => cb(data);
  ipcRenderer.on(channel, wrapped);
  listeners.set(cb, [channel, wrapped]);
  return () => {
    const v = listeners.get(cb);
    if (v) { ipcRenderer.removeListener(v[0], v[1]); listeners.delete(cb); }
  };
}

contextBridge.exposeInMainWorld('ovyra', {
  // ---- Tabs ----
  tabCreate:   (url)             => invoke('tab:create',   { url }),
  tabClose:    (id)              => invoke('tab:close',    { id }),
  tabShow:     (id, pane)        => invoke('tab:show',     { id, pane }),
  tabHide:     (pane)            => invoke('tab:hide',     { pane }),
  tabNavigate: (id, url)         => invoke('tab:navigate', { id, url }),
  tabBack:     (id)              => invoke('tab:back',     { id }),
  tabForward:  (id)              => invoke('tab:forward',  { id }),
  tabReload:   (id)              => invoke('tab:reload',   { id }),
  tabSleep:    (id)              => invoke('tab:sleep',    { id }),
  tabWake:     (id)              => invoke('tab:wake',     { id }),

  // ---- Sidebar app webviews ----
  appShow:    (appId, url)       => invoke('app:show',    { appId, url }),
  appHide:    (appId)            => invoke('app:hide',    { appId }),
  appHideAll: ()                 => invoke('app:hideAll'),
  appClose:   (appId)            => invoke('app:close',   { appId }),
  appBounds:  (appId, bounds)    => send('app:bounds',    { appId, bounds }),

  // ---- Viewport bounds ----
  viewportBounds: (pane, bounds) => send('viewport:bounds', { pane, bounds }),
  viewsSetVisible: (visible)    => send('views:setVisible', { visible }),

  // ---- Window controls ----
  winMinimize:  () => send('win:minimize'),
  winMaxToggle: () => send('win:maxtoggle'),
  winClose:     () => send('win:close'),

  // ---- Guardian / privacy ----
  guardianSet:  (cfg) => invoke('guardian:set', cfg),
  guardianGet:  ()    => invoke('guardian:get'),
  clearCookies: (hostnames) => invoke('privacy:clearCookies', { hostnames }),

  // ---- Misc ----
  openExternal: (url) => send('shell:open', { url }),
  metrics:      ()    => invoke('stats:metrics'),
  on
});
