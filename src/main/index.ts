import './bootstrap'
import { app, Menu, nativeTheme, session } from 'electron'
import { registerAsBrowser, urlFromArgs } from './defaultbrowser'
import { initExtensions } from './extensions'
import { registerIpc } from './ipc'
import { initPanels } from './panels'
import { initFilters } from './privacy/engine'
import { onRequestBlocked, registerPrivacyIpc } from './privacy/network'
import { registerSchemePrivileges } from './protocol'
import { setupBrowsingSession } from './sessions'
import { loadSession, saveSessionNow, setSessionProvider } from './sessionstore'
import { getSettings, onSettingsChanged, updateSettings } from './settings'
import { flushAllStores } from './store'
import { tabsByContents } from './tab'
import { initUpdater } from './updater'
import { applyColorMode, BrowserWin, repaintWindowChrome } from './window'

registerSchemePrivileges()
app.setAppUserModelId('com.ovyra.browser')

// Sites (Google sign-in especially) treat "Electron" in the user agent as an embedded,
// untrusted browser. Present the plain Chrome user agent the engine really is.
app.userAgentFallback = app.userAgentFallback.replace(/\s(Electron|ovyra)\/\S+/gi, '')

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    const bw = BrowserWin.focused()
    const url = urlFromArgs(argv)
    if (!bw) return void BrowserWin.open()
    if (url) bw.newTab(url)
    if (bw.win.isMinimized()) bw.win.restore()
    bw.win.focus()
  })

  app.whenReady().then(async () => {
    applyColorMode(getSettings().appearance.mode)
    let mode = getSettings().appearance.mode
    let compact = getSettings().appearance.compactTabs
    onSettingsChanged((st) => {
      if (st.appearance.mode !== mode) applyColorMode((mode = st.appearance.mode))
      // Heavy Mode: background tabs run at full speed.
      for (const w of BrowserWin.all) for (const t of w.tabs) t.wc?.setBackgroundThrottling(!st.performance.heavy)
      // The native window buttons follow the tab strip's height.
      if (st.appearance.compactTabs !== compact) {
        compact = st.appearance.compactTabs
        repaintWindowChrome()
      }
    })
    // In 'system' mode Windows can switch between light and dark at any time.
    nativeTheme.on('updated', repaintWindowChrome)
    Menu.setApplicationMenu(null)
    // DNS over HTTPS whenever the system's DNS provider supports it.
    app.configureHostResolver({ secureDnsMode: 'automatic' })
    // WebRTC (video calls) may only use the public network route, so sites can't read
    // the computer's local IP addresses, like Brave's default.
    app.on('web-contents-created', (_e, wc) => wc.setWebRTCIPHandlingPolicy('default_public_interface_only'))

    setupBrowsingSession(session.defaultSession, { incognito: false })
    registerPrivacyIpc()
    void initFilters()
    // Extensions load before the first window so their content scripts see every tab.
    await initExtensions().catch((err) => console.error('[extensions] failed to start', err))
    onRequestBlocked((id, url) => tabsByContents.get(id)?.recordBlocked(url))
    registerIpc()
    initPanels({
      onChange: () => {
        for (const w of BrowserWin.all) w.tabChanged()
      },
      focusedWindow: () => BrowserWin.focused()
    })

    setSessionProvider(() => [...BrowserWin.all].filter((w) => !w.incognito).map((w) => w.snapshot()))
    const restored = getSettings().startup === 'restore' ? loadSession() : []
    if (restored.length) for (const w of restored) BrowserWin.open(w)
    else BrowserWin.open()

    // Dev builds expose internals to the debugger (`npm run dev -- --inspect`).
    if (!app.isPackaged) Object.assign(globalThis, { __ovyra: { BrowserWin } })

    const url = urlFromArgs(process.argv)
    if (url) BrowserWin.focused()?.newTab(url)
    // First run: open the setup wizard. After an update: show what's new, once.
    const version = app.getVersion()
    if (!getSettings().onboarded) {
      BrowserWin.focused()?.openInternal('welcome')
      updateSettings({ lastSeenVersion: version })
    } else if (getSettings().lastSeenVersion !== version && app.isPackaged) {
      BrowserWin.focused()?.openInternal('whatsnew')
      updateSettings({ lastSeenVersion: version })
    }
    // So Windows lists Ovyra under Default apps → Web browser.
    void registerAsBrowser()

    // Updates download in the background and apply on restart.
    initUpdater(() => {})

    // Sleeping tabs: unload background tabs that haven't been looked at in a while
    // (never in Heavy Mode).
    setInterval(() => {
      const { sleepAfterMinutes: minutes, performance } = getSettings()
      if (minutes > 0 && !performance.heavy) for (const w of BrowserWin.all) w.sleepIdleTabs(minutes * 60_000)
    }, 30_000)
    // The RAM limit: over it, the least recently used background tab goes to sleep.
    setInterval(() => {
      const limitGB = getSettings().performance.ramLimitGB
      if (limitGB > 0) enforceMemoryLimit(limitGB * 1024 * 1024)
    }, 10_000)
  })

  function enforceMemoryLimit(limitKB: number): void {
    const usedKB = app.getAppMetrics().reduce((n, m) => n + m.memory.workingSetSize, 0)
    if (usedKB <= limitKB) return
    const [oldest] = [...BrowserWin.all]
      .flatMap((w) => w.sleepCandidates().map((tab) => ({ w, tab })))
      .sort((a, b) => a.tab.lastActive - b.tab.lastActive)
    if (oldest) oldest.w.sleepTab(oldest.tab)
  }

  app.on('before-quit', () => {
    saveSessionNow(true)
    flushAllStores()
  })
  app.on('window-all-closed', () => app.quit())
}
