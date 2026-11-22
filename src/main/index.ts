import './bootstrap'
import { app, Menu, nativeTheme, session } from 'electron'
import { registerAsBrowser, urlFromArgs } from './defaultbrowser'
import { initExtensions } from './extensions'
import { registerIpc } from './ipc'
import { initPanels } from './panels'
import { initFilters } from './privacy/engine'
import { onClipboardBlocked, onRequestBlocked, registerPrivacyIpc } from './privacy/network'
import { batterySaverActive, initBatterySaver } from './battery'
import { initSiteMods } from './sitemods'
import { registerPasswordIpc } from './passwords'
import { registerAutofillIpc } from './autofill'
import { initStoreExtensions } from './extstore'
import { isMaskedSession } from './privacy/network'
import { initLock, unlockAtStart } from './lock'
import { onMilestone } from './privacy/shields'
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

// Sites treat unknown names in the user agent badly: Google sign-in refuses "Electron", and
// Twitch sends "Alchemy/…" to its mobile site. Present the plain Chrome user agent the engine
// really is, with every extra product name (Alchemy, Electron, ovyra, …) removed.
app.userAgentFallback = plainChromeUserAgent(app.userAgentFallback)

function plainChromeUserAgent(ua: string): string {
  return ua
    .replace(/\(KHTML, like Gecko\)(?:\s+(?!Chrome\/)\S+\/\S+)+/, '(KHTML, like Gecko)')
    .replace(/\s(Electron|ovyra|Alchemy)\/\S+/gi, '')
}

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
    let material = getSettings().appearance.material
    repaintWindowChrome()
    onSettingsChanged((st) => {
      if (st.appearance.mode !== mode) applyColorMode((mode = st.appearance.mode))
      // Heavy Mode: background tabs run at full speed.
      for (const w of BrowserWin.all) for (const t of w.tabs) t.wc?.setBackgroundThrottling(!st.performance.heavy)
      // The native window buttons follow the tab strip's height.
      if (st.appearance.compactTabs !== compact || st.appearance.material !== material) {
        compact = st.appearance.compactTabs
        material = st.appearance.material
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
    // #443 With "Stop WebRTC leaking your IP" (always in Masked Mode and Tor), calls may only use
    // the route normal browsing uses, so a VPN or proxy can't be gone around.
    app.on('web-contents-created', (_e, wc) =>
      wc.setWebRTCIPHandlingPolicy(getSettings().webrtcStrict || isMaskedSession(wc.session) ? 'disable_non_proxied_udp' : 'default_public_interface_only')
    )

    setupBrowsingSession(session.defaultSession, { incognito: false })
    registerPrivacyIpc()
    void initFilters()
    // Extensions load before the first window so their content scripts see every tab.
    await initExtensions().catch((err) => console.error('[extensions] failed to start', err))
    // Extensions from Alchemy Extensions (the store), checked for updates every few hours.
    await initStoreExtensions().catch((err) => console.error('[store] failed to start', err))
    onRequestBlocked((id, url, tracker) => tabsByContents.get(id)?.recordBlocked(url, tracker))
    // Gold toast and confetti in the window you're using when Aegis passes 1,000, 10,000, …
    onMilestone((n) => BrowserWin.focused()?.send('aegis:milestone', n))
    registerIpc()
    initPanels({
      onChange: () => {
        for (const w of BrowserWin.all) w.tabChanged()
      },
      focusedWindow: () => BrowserWin.focused()
    })

    setSessionProvider(() => [...BrowserWin.all].filter((w) => !w.incognito).map((w) => w.snapshot()))
    // Locked with Windows Hello: nothing opens until you pass.
    if (!(await unlockAtStart())) return app.quit()
    initLock()
    const restored = getSettings().startup === 'restore' ? loadSession() : []
    if (restored.length) for (const w of restored) BrowserWin.open(w)
    else BrowserWin.open()

    // Dev builds expose internals to the debugger (`npm run dev -- --inspect`).
    if (!app.isPackaged) {
      const [bookmarks, history, downloads, importer, engine, sitemods] = await Promise.all([import('./bookmarks'), import('./history'), import('./downloads'), import('./importer'), import('./privacy/engine'), import('./sitemods')])
      Object.assign(globalThis, { __alchemy: { BrowserWin, bookmarks, history, downloads, importer, engine, sitemods } })
    }

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
    // So Windows lists Alchemy under Default apps → Web browser.
    void registerAsBrowser()

    initBatterySaver()
    initSiteMods()
    registerPasswordIpc()
    registerAutofillIpc()
    // Tell the window you're looking at when paste protection steps in.
    onClipboardBlocked((id) => {
      const tab = tabsByContents.get(id)
      for (const w of BrowserWin.all) if (tab && w.tabs.includes(tab)) w.send('toast', { text: 'Stopped this site changing your clipboard' })
    })
    // Updates download in the background and apply on restart.
    initUpdater(() => {})

    // Sleeping tabs: unload background tabs that haven't been looked at in a while
    // (never in Heavy Mode).
    setInterval(() => {
      const { sleepAfterMinutes, performance } = getSettings()
      // Battery saver puts tabs to sleep sooner, even if sleeping tabs are otherwise off.
      const minutes = batterySaverActive() ? Math.min(sleepAfterMinutes || 5, 5) : sleepAfterMinutes
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
