import { app, Menu, nativeTheme, session } from 'electron'
import { initExtensions } from './extensions'
import { registerIpc } from './ipc'
import { initPanels } from './panels'
import { initFilters } from './privacy/engine'
import { onRequestBlocked, registerPrivacyIpc } from './privacy/network'
import { registerSchemePrivileges } from './protocol'
import { setupBrowsingSession } from './sessions'
import { loadSession, saveSessionNow, setSessionProvider } from './sessionstore'
import { getSettings, onSettingsChanged } from './settings'
import { flushAllStores } from './store'
import { tabsByContents } from './tab'
import { initUpdater } from './updater'
import { applyColorMode, BrowserWin, repaintWindowChrome } from './window'

registerSchemePrivileges()
// Dev builds keep painting even when covered by other windows, so they can be inspected.
if (!app.isPackaged) app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
app.setAppUserModelId('com.ovyra.browser')

// Sites (Google sign-in especially) treat "Electron" in the user agent as an embedded,
// untrusted browser. Present the plain Chrome user agent the engine really is.
app.userAgentFallback = app.userAgentFallback.replace(/\s(Electron|ovyra)\/\S+/gi, '')

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    const bw = BrowserWin.focused()
    const url = argv.find((a) => /^https?:\/\//i.test(a))
    if (!bw) return void BrowserWin.open()
    if (url) bw.newTab(url)
    if (bw.win.isMinimized()) bw.win.restore()
    bw.win.focus()
  })

  app.whenReady().then(async () => {
    applyColorMode(getSettings().appearance.mode)
    let mode = getSettings().appearance.mode
    onSettingsChanged((st) => {
      if (st.appearance.mode !== mode) applyColorMode((mode = st.appearance.mode))
    })
    // In 'system' mode Windows can switch between light and dark at any time.
    nativeTheme.on('updated', repaintWindowChrome)
    Menu.setApplicationMenu(null)

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

    const url = process.argv.find((a) => /^https?:\/\//i.test(a))
    if (url) BrowserWin.focused()?.newTab(url)
    // First run: open the setup wizard.
    if (!getSettings().onboarded) BrowserWin.focused()?.openInternal('welcome')

    // Updates download in the background and apply on restart.
    initUpdater(() => {})

    // Sleeping tabs: unload background tabs that haven't been looked at in a while.
    setInterval(() => {
      const minutes = getSettings().sleepAfterMinutes
      if (minutes > 0) for (const w of BrowserWin.all) w.sleepIdleTabs(minutes * 60_000)
    }, 30_000)
  })

  app.on('before-quit', () => {
    saveSessionNow(true)
    flushAllStores()
  })
  app.on('window-all-closed', () => app.quit())
}
