/* ==========================================================================
   OVYRA — Electron Main Process
   Studio: FiveNova · Creator: SkyNexusHD
   ========================================================================== */

const { app, BrowserWindow, WebContentsView, ipcMain, session, shell, screen } = require('electron');
const path = require('node:path');

// ---------- Performance flags (must be set before app is ready) ----------
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-accelerated-video-decode');
app.commandLine.appendSwitch('enable-features', 'CanvasOopRasterization,VaapiVideoDecoder');
// Skip the Windows occlusion check — it can stall rendering for ~250ms after focus changes.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('enable-smooth-scrolling');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

// ---------- Globals ----------
let mainWindow = null;
const tabs = new Map();           // tabId -> { view, url, title, sleeping, sleepUrl }
const paneAssign = { primary: null, secondary: null };
let viewportBounds = { primary: null, secondary: null };

// Sidebar/app side-panel webviews (Opera-style apps + Echo music sources).
// Keyed by a renderer-supplied appId. Each has its own bounds anchor.
const appViews = new Map();       // appId -> { view, url, bounds }

// Guardian
const TRACKER_HOSTS = [
  'doubleclick.net','google-analytics.com','googletagmanager.com','googlesyndication.com',
  'facebook.net','connect.facebook.net','scorecardresearch.com','quantserve.com',
  'adservice.google.com','adsystem.amazon-adsystem.com','amazon-adsystem.com',
  'criteo.com','taboola.com','outbrain.com','hotjar.com','mixpanel.com',
  'segment.io','adnxs.com','adsrvr.org','rubiconproject.com','pubmatic.com',
  'openx.net','smartadserver.com','moatads.com'
];
const guardianState = {
  enabled: true, ads: true, trackers: true, https: true, safePath: true,
  blockedTotal: 0
};

// ---------- App lifecycle ----------
app.whenReady().then(() => {
  // Force a clean Chrome user-agent so UA-sniffing sites (WhatsApp Web,
  // Snapchat, some banks) accept us. Electron 32 ships Chromium 128, so this
  // is honest — we just hide the "Electron/<ver>" and "ovyra/<ver>" tokens
  // that the default UA includes and that block-list checks reject.
  app.userAgentFallback =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

  installRequestInterceptors();
  createMainWindow();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow(); });
app.on('second-instance', () => {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
});

// ==========================================================================
// MAIN WINDOW
// ==========================================================================

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#10182B',
    icon: path.join(__dirname, 'Logo.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.on('resize', () => emitToRenderer('window:resized'));
  mainWindow.on('maximize', () => {
    // Override the native maximize so an auto-hidden Windows taskbar can still
    // reveal on hover. Native maximize covers the entire screen including the
    // taskbar zone, which Windows interprets as "fullscreen-like" and blocks
    // the taskbar reveal. Setting bounds to workArea (and shaving 1px off the
    // bottom) keeps Windows happy with auto-hide.
    const display = screen.getDisplayMatching(mainWindow.getBounds());
    const wa = display.workArea;
    mainWindow.setBounds({ x: wa.x, y: wa.y, width: wa.width, height: wa.height - 1 });
    emitToRenderer('window:state', { maximized: true });
  });
  mainWindow.on('unmaximize', () => emitToRenderer('window:state', { maximized: false }));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function emitToRenderer(channel, ...args) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, ...args);
}

// ==========================================================================
// GUARDIAN
// ==========================================================================

function installRequestInterceptors() {
  const sess = session.defaultSession;
  sess.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    if (!guardianState.enabled) return callback({});
    let url;
    try { url = new URL(details.url); } catch { return callback({}); }

    if (guardianState.https && url.protocol === 'http:' && details.resourceType === 'mainFrame') {
      url.protocol = 'https:';
      return callback({ redirectURL: url.toString() });
    }

    const host = url.hostname.toLowerCase();
    const blocked = (guardianState.trackers || guardianState.ads) &&
      TRACKER_HOSTS.some(t => host === t || host.endsWith('.' + t));
    if (blocked) {
      guardianState.blockedTotal++;
      emitToRenderer('guardian:blocked', { host, url: details.url, ts: Date.now() });
      return callback({ cancel: true });
    }

    if (guardianState.safePath && /[?&](redirect|redir|url|target|out)=/i.test(details.url)) {
      emitToRenderer('guardian:safepath', { url: details.url });
    }
    callback({});
  });
}

// ==========================================================================
// TAB / VIEW MANAGEMENT
// ==========================================================================

const START_URL = 'file://' + path.join(__dirname, 'start.html').replace(/\\/g, '/');

function createTabView(tabId, url) {
  const view = new WebContentsView({
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  const wc = view.webContents;

  wc.on('page-title-updated', (_e, title) => {
    const tab = tabs.get(tabId); if (!tab) return;
    tab.title = title;
    emitToRenderer('tab:title', { id: tabId, title });
  });
  wc.on('did-navigate', (_e, navUrl) => emitNav(tabId, navUrl, wc));
  wc.on('did-navigate-in-page', (_e, navUrl) => emitNav(tabId, navUrl, wc));
  wc.on('did-start-loading', () => emitToRenderer('tab:loading', { id: tabId, loading: true }));
  wc.on('did-stop-loading', ()  => emitToRenderer('tab:loading', { id: tabId, loading: false }));
  wc.on('page-favicon-updated', (_e, favicons) => {
    emitToRenderer('tab:favicon', { id: tabId, favicon: favicons?.[0] || null });
  });
  wc.setWindowOpenHandler(({ url: openUrl }) => {
    emitToRenderer('tab:requestNew', { url: openUrl });
    return { action: 'deny' };
  });
  wc.loadURL(url || START_URL);
  return view;
}
function emitNav(tabId, navUrl, wc) {
  const tab = tabs.get(tabId); if (!tab) return;
  tab.url = navUrl;
  emitToRenderer('tab:url', { id: tabId, url: navUrl, canBack: wc.navigationHistory.canGoBack(), canFwd: wc.navigationHistory.canGoForward() });
}

function attachViewToWindow(view) { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.contentView.addChildView(view); }
function detachView(view) { if (mainWindow && !mainWindow.isDestroyed()) try { mainWindow.contentView.removeChildView(view); } catch {} }

function applyBoundsToPane(pane) {
  const tabId = paneAssign[pane];
  if (!tabId) return;
  const tab = tabs.get(tabId);
  if (!tab || tab.sleeping) return;
  const b = viewportBounds[pane]; if (!b) return;
  const winBounds = mainWindow.getContentBounds();
  const x = Math.max(0, Math.round(b.x));
  const y = Math.max(0, Math.round(b.y));
  const width  = Math.max(0, Math.min(Math.round(b.width),  winBounds.width  - x));
  const height = Math.max(0, Math.min(Math.round(b.height), winBounds.height - y));
  tab.view.setBounds({ x, y, width, height });
}

function showTabInPane(tabId, pane) {
  const prevId = paneAssign[pane];
  if (prevId && prevId !== tabId) {
    const prev = tabs.get(prevId);
    if (prev?.view) detachView(prev.view);
  }
  paneAssign[pane] = tabId;
  const tab = tabs.get(tabId);
  if (!tab) return;
  if (tab.sleeping) wakeTab(tabId);
  attachViewToWindow(tab.view);
  applyBoundsToPane(pane);
  try { mainWindow.contentView.addChildView(tab.view); } catch {}
}
function clearPane(pane) {
  const id = paneAssign[pane];
  if (id) { const tab = tabs.get(id); if (tab?.view) detachView(tab.view); }
  paneAssign[pane] = null;
}

function sleepTab(tabId) {
  const tab = tabs.get(tabId);
  if (!tab || tab.sleeping) return;
  tab.sleeping = true; tab.sleepUrl = tab.url;
  detachView(tab.view);
  try { tab.view.webContents.close({ waitForBeforeUnload: false }); } catch {}
  tab.view = null;
  emitToRenderer('tab:sleep', { id: tabId, sleeping: true });
}
function wakeTab(tabId) {
  const tab = tabs.get(tabId);
  if (!tab || !tab.sleeping) return;
  tab.view = createTabView(tabId, tab.sleepUrl || START_URL);
  tab.sleeping = false;
  emitToRenderer('tab:sleep', { id: tabId, sleeping: false });
  for (const pane of ['primary', 'secondary']) {
    if (paneAssign[pane] === tabId) {
      attachViewToWindow(tab.view);
      applyBoundsToPane(pane);
    }
  }
}

// ==========================================================================
// APP VIEWS — sidebar apps + Echo music sources. These are persistent
// WebContentsViews positioned via a renderer-supplied bounds anchor. Unlike
// tabs they have a fixed appId (e.g. 'whatsapp', 'echo:spotify') so the
// renderer can show/hide them without losing state.
// ==========================================================================

function ensureAppView(appId, url) {
  let entry = appViews.get(appId);
  if (entry) return entry;
  const view = new WebContentsView({
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  view.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    emitToRenderer('tab:requestNew', { url: openUrl });
    return { action: 'deny' };
  });
  view.webContents.loadURL(url);
  entry = { view, url, bounds: null };
  appViews.set(appId, entry);
  return entry;
}

function applyAppBounds(appId) {
  const entry = appViews.get(appId);
  if (!entry || !entry.bounds) return;
  const winBounds = mainWindow.getContentBounds();
  const b = entry.bounds;
  const x = Math.max(0, Math.round(b.x));
  const y = Math.max(0, Math.round(b.y));
  const width  = Math.max(0, Math.min(Math.round(b.width),  winBounds.width  - x));
  const height = Math.max(0, Math.min(Math.round(b.height), winBounds.height - y));
  entry.view.setBounds({ x, y, width, height });
}

ipcMain.handle('app:show', (_e, { appId, url }) => {
  // Detach all other app views so only one is visible at a time.
  for (const [otherId, entry] of appViews.entries()) {
    if (otherId !== appId) try { detachView(entry.view); } catch {}
  }
  const entry = ensureAppView(appId, url);
  attachViewToWindow(entry.view);
  applyAppBounds(appId);
  return { ok: true };
});
ipcMain.handle('app:hide', (_e, { appId }) => {
  const entry = appViews.get(appId);
  if (entry) try { detachView(entry.view); } catch {}
});
ipcMain.handle('app:hideAll', () => {
  for (const entry of appViews.values()) try { detachView(entry.view); } catch {}
});
ipcMain.handle('app:close', (_e, { appId }) => {
  const entry = appViews.get(appId);
  if (!entry) return;
  try { detachView(entry.view); } catch {}
  try { entry.view.webContents.close({ waitForBeforeUnload: false }); } catch {}
  appViews.delete(appId);
});
ipcMain.on('app:bounds', (_e, { appId, bounds }) => {
  const entry = appViews.get(appId);
  if (!entry) return;
  entry.bounds = bounds;
  applyAppBounds(appId);
});

// ==========================================================================
// IPC HANDLERS — tabs, window, guardian, etc.
// ==========================================================================

ipcMain.handle('tab:create', (_e, { url } = {}) => {
  const tabId = 't_' + Math.random().toString(36).slice(2, 10);
  const view = createTabView(tabId, url || START_URL);
  tabs.set(tabId, { view, url: url || START_URL, title: 'New Tab', sleeping: false });
  return { id: tabId };
});
ipcMain.handle('tab:close', (_e, { id }) => {
  const tab = tabs.get(id); if (!tab) return;
  for (const pane of ['primary', 'secondary']) if (paneAssign[pane] === id) clearPane(pane);
  if (tab.view) try { tab.view.webContents.close({ waitForBeforeUnload: false }); } catch {}
  tabs.delete(id);
});
ipcMain.handle('tab:show',     (_e, { id, pane = 'primary' }) => showTabInPane(id, pane));
ipcMain.handle('tab:hide',     (_e, { pane }) => clearPane(pane));
ipcMain.handle('tab:navigate', (_e, { id, url }) => {
  const tab = tabs.get(id); if (!tab) return;
  if (tab.sleeping) wakeTab(id);
  tab.view.webContents.loadURL(url);
});
ipcMain.handle('tab:back',    (_e, { id }) => { tabs.get(id)?.view?.webContents.navigationHistory.goBack(); });
ipcMain.handle('tab:forward', (_e, { id }) => { tabs.get(id)?.view?.webContents.navigationHistory.goForward(); });
ipcMain.handle('tab:reload',  (_e, { id }) => { tabs.get(id)?.view?.webContents.reload(); });
ipcMain.handle('tab:sleep',   (_e, { id }) => sleepTab(id));
ipcMain.handle('tab:wake',    (_e, { id }) => wakeTab(id));

ipcMain.on('viewport:bounds', (_e, { pane, bounds }) => {
  viewportBounds[pane] = bounds;
  applyBoundsToPane(pane);
});

ipcMain.on('views:setVisible', (_e, { visible }) => {
  for (const tab of tabs.values()) {
    if (tab.view && !tab.sleeping) try { tab.view.setVisible(!!visible); } catch {}
  }
  for (const entry of appViews.values()) {
    try { entry.view.setVisible(!!visible); } catch {}
  }
});

ipcMain.on('win:minimize',  () => mainWindow?.minimize());
ipcMain.on('win:maxtoggle', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('win:close', () => mainWindow?.close());

ipcMain.handle('guardian:set', (_e, partial) => { Object.assign(guardianState, partial || {}); return { ...guardianState }; });
ipcMain.handle('guardian:get', () => ({ ...guardianState }));

ipcMain.handle('privacy:clearCookies', async (_e, { hostnames } = {}) => {
  const sess = session.defaultSession;
  if (Array.isArray(hostnames) && hostnames.length) {
    for (const h of hostnames) {
      const cookies = await sess.cookies.get({ domain: h });
      for (const c of cookies) {
        try { await sess.cookies.remove((c.secure ? 'https://' : 'http://') + c.domain.replace(/^\./, '') + c.path, c.name); } catch {}
      }
    }
  } else {
    await sess.clearStorageData({ storages: ['cookies'] });
  }
  return { ok: true };
});

ipcMain.on('shell:open', (_e, { url }) => { try { shell.openExternal(url); } catch {} });

ipcMain.handle('stats:metrics', () => {
  const metrics = app.getAppMetrics();
  let totalMem = 0, cpu = 0;
  for (const m of metrics) {
    totalMem += (m.memory?.workingSetSize || 0);
    cpu += (m.cpu?.percentCPUUsage || 0);
  }
  return {
    ramMB: Math.round(totalMem / 1024),
    cpu: Math.round(cpu),
    tabCount: tabs.size,
    sleeping: [...tabs.values()].filter(t => t.sleeping).length,
    blocked: guardianState.blockedTotal
  };
});
