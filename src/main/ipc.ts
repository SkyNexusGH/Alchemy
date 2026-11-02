import { app, clipboard, ClipboardItem, dialog, ipcMain, nativeImage, session, type WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { totalmem } from 'node:os'
import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { toUrl } from '@shared/url'
import type { ColorMode, InternalPage, OverlayPayload, PanelItem, Rect, SearchEngineId, Settings, ShieldsInfo, Workspace } from '@shared/types'
import { isDefaultBrowser, openDefaultAppsSettings } from './defaultbrowser'
import { listExtensions, removeExtension } from './extensions'
import { importSources, runImport } from './importer'
import { chooseMenuItem, showMenu } from './popup'
import { destroyPanel, hidePanel, panelStates, reloadPanel, showPanel, togglePanel } from './panels'
import { stepZoom, tabsByContents } from './tab'
import { checkForUpdates, installUpdate, updateState } from './updater'
import * as bookmarks from './bookmarks'
import { broadcast } from './broadcast'
import { clearDownloads, downloadAction, listDownloads } from './downloads'
import * as history from './history'
import { appMenu, appMenuInfo, bookmarkFolderMenu, tabContextMenu } from './menus'
import { localSuggestions, remoteSuggestions, resolveInput, searchUrl } from './omnibox'
import { clearPermissionDecisions } from './permissions'
import { filterStatus, updateFilters } from './privacy/engine'
import { blockStats, setSiteShields, shieldExceptions, shieldsEnabled, siteOf } from './privacy/shields'
import { isInternalUrl, userAssetsDir } from './protocol'
import { getSettings, onSettingsChanged, updateSettings } from './settings'
import { BrowserWin } from './window'

interface Ctx {
  bw: BrowserWin | undefined
  sender: WebContents
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Handler = (ctx: Ctx, ...args: any[]) => unknown

/**
 * Only the browser's own pages may call into the main process. `shellOnly` channels are
 * further limited to the window UI and its overlay — internal pages in tabs can't use them.
 */
function handle(channel: string, fn: Handler, shellOnly = false): void {
  ipcMain.handle(channel, (event, ...args) => {
    const frame = event.senderFrame
    if (!frame || frame !== event.sender.mainFrame || !isInternalUrl(frame.url)) throw new Error('Forbidden')
    const bw = BrowserWin.fromWebContents(event.sender)
    if (shellOnly && !(bw && (bw.win.webContents === event.sender || bw.overlay.webContents === event.sender))) {
      throw new Error('Forbidden')
    }
    return fn({ bw, sender: event.sender }, ...args)
  })
}

const shell = (channel: string, fn: Handler): void => handle(channel, fn, true)

function restartApp(): void {
  app.relaunch()
  app.quit()
}

export function registerIpc(): void {
  // ---- window UI ----
  shell('window:state', ({ bw }) => bw?.state())
  shell('layout:content', ({ bw }, rect: Rect) => bw?.setContentRect(rect))
  shell('tab:new', ({ bw }) => bw?.newTab())
  shell('tab:activate', ({ bw }, id: number) => {
    const tab = bw?.tab(id)
    if (tab) bw!.activate(tab)
  })
  shell('tab:close', ({ bw }, id: number) => {
    const tab = bw?.tab(id)
    if (tab) bw!.closeTab(tab)
  })
  /** Memory used by the process showing a tab, in MB (null while it sleeps). */
  shell('tab:memory', ({ bw }, id: number) => {
    const wc = bw?.tab(id)?.wc
    if (!wc || wc.isDestroyed()) return null
    const pid = wc.getOSProcessId()
    const metric = app.getAppMetrics().find((m) => m.pid === pid)
    return metric ? Math.round(metric.memory.workingSetSize / 1024) : null
  })
  shell('tab:move', ({ bw }, id: number, to: number) => bw?.moveTab(id, to))
  shell('tab:mute', ({ bw }, id: number) => {
    const tab = bw?.tab(id)
    tab?.setMuted(!tab.muted)
  })
  shell('tab:menu', ({ bw }, id: number, x: number, y: number) => {
    const tab = bw?.tab(id)
    if (tab) tabContextMenu(bw!, tab, x, y)
  })
  shell('tab:navigate', ({ bw }, input: string, opts?: { newTab?: boolean; background?: boolean; engine?: string }) =>
    bw?.navigate(input, opts)
  )
  shell('nav', ({ bw }, action: 'back' | 'forward' | 'reload' | 'hardReload' | 'stop') => {
    const tab = bw?.active
    const wc = tab?.wc
    if (!tab) return
    if (action === 'back') wc?.navigationHistory.goBack()
    if (action === 'forward') wc?.navigationHistory.goForward()
    if (action === 'reload') tab.reload()
    if (action === 'hardReload') tab.reload(true)
    if (action === 'stop') wc?.stop()
  })
  // Also used by the new tab page's own search box.
  handle('omnibox:local', (_c, text: string) => localSuggestions(text))
  handle('omnibox:remote', (_c, text: string, engine?: SearchEngineId) => remoteSuggestions(text, engine))
  shell('menu:choose', ({ bw }, id: string) => {
    bw?.hideOverlay()
    chooseMenuItem(id)
  })
  shell('layout:devtools', ({ bw }, rect: Rect) => bw?.setDevtoolsRect(rect))
  shell('devtools:close', ({ bw }) => bw?.active && bw.closeDevTools(bw.active))
  shell('overlay:show', ({ bw }, rect: Rect, payload: OverlayPayload, focus?: boolean) =>
    bw?.showOverlay(rect, payload, focus)
  )
  shell('overlay:update', ({ bw }, payload: OverlayPayload) => bw?.updateOverlay(payload))
  shell('overlay:resize', ({ bw }, height: number) => bw?.resizeOverlay(height))
  shell('overlay:hide', ({ bw }) => bw?.hideOverlay())
  shell('overlay:pick', ({ bw }, index: number, modifiers?: { newTab?: boolean }) =>
    bw?.send('overlay:picked', index, modifiers)
  )
  shell('find:query', ({ bw }, text: string, forward?: boolean, next?: boolean) => bw?.findQuery(text, forward, next))
  shell('find:close', ({ bw }) => bw?.closeFind())
  shell('menu:app', ({ bw }, x: number, y: number) => bw && appMenu(bw, x, y))
  shell('appmenu:info', ({ bw }) => bw && appMenuInfo(bw))
  shell('menu:bookmarkFolder', ({ bw }, id: string, x: number, y: number) => bw && bookmarkFolderMenu(bw, id, x, y))
  shell('zoom:reset', ({ bw }) => {
    bw?.active?.wc?.setZoomFactor(1)
    bw?.tabChanged()
  })
  shell('bookmark:toggleActive', ({ bw }) => bw?.toggleBookmarkActive())
  handle('internal:open', ({ bw }, page: InternalPage) => bw?.openInternal(page))

  // ---- any internal page ----
  handle('settings:get', () => getSettings())
  handle('settings:set', (_c, patch: Partial<Settings>) => updateSettings(patch))

  handle('history:query', (_c, text: string, before?: number) => history.queryVisits(text ?? '', 300, before ?? Infinity))
  handle('history:delete', (_c, url: string, time: number) => history.deleteVisit(url, time))
  handle('history:top', (_c, n: number) => history.topSites(n))
  handle('history:favicons', (_c, urls: string[]) =>
    Object.fromEntries(urls.map((u) => [u, history.faviconForSite(u)]))
  )
  // The new tab page's search box hands off to the real omnibox (with its suggestions).
  handle('omnibox:focus', ({ bw }) => bw?.focusOmnibox())

  handle('bookmarks:list', () => bookmarks.allBookmarks())
  handle('bookmarks:add', (_c, input: Parameters<typeof bookmarks.addBookmark>[0]) => bookmarks.addBookmark(input))
  handle('bookmarks:update', (_c, id: string, patch: Parameters<typeof bookmarks.updateBookmark>[1]) =>
    bookmarks.updateBookmark(id, patch)
  )
  handle('bookmarks:remove', (_c, id: string) => bookmarks.removeBookmark(id))

  handle('downloads:list', () => listDownloads())
  handle('downloads:action', (_c, id: string, action: string) => downloadAction(id, action, session.defaultSession))
  handle('downloads:clear', () => clearDownloads())

  handle('data:clear', async (_c, what: { history?: boolean; cookies?: boolean; cache?: boolean; downloads?: boolean; permissions?: boolean }) => {
    const s = session.defaultSession
    if (what.history) history.clearHistory()
    if (what.downloads) clearDownloads()
    if (what.permissions) clearPermissionDecisions()
    if (what.cache) {
      await s.clearCache()
      await s.clearCodeCaches({})
    }
    if (what.cookies) await s.clearStorageData()
  })

  /** Lets the user pick their own new tab background; a copy is kept with Ovyra's data. */
  handle('appearance:pickBackground', async ({ sender }) => {
    const owner = BrowserWin.fromWebContents(sender)?.win
    const opts: Electron.OpenDialogOptions = {
      title: 'Choose a background image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'] }]
    }
    const res = owner ? await dialog.showOpenDialog(owner, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled || !res.filePaths[0]) return null
    const dir = userAssetsDir()
    mkdirSync(dir, { recursive: true })
    for (const f of readdirSync(dir)) if (f.startsWith('background-')) rmSync(join(dir, f), { force: true })
    // A new name each time so pages don't keep showing a cached old image.
    const name = `background-${Date.now()}${extname(res.filePaths[0]).toLowerCase()}`
    copyFileSync(res.filePaths[0], join(dir, name))
    const appearance = { ...getSettings().appearance, background: 'custom', customBackground: name }
    updateSettings({ appearance })
    return name
  })

  handle('dialog:pickFolder', async ({ sender }) => {
    const owner = BrowserWin.fromWebContents(sender)?.win
    const opts: Electron.OpenDialogOptions = { properties: ['openDirectory', 'createDirectory'] }
    const res = owner ? await dialog.showOpenDialog(owner, opts) : await dialog.showOpenDialog(opts)
    return res.canceled ? null : res.filePaths[0]
  })

  // Warming up speed dial sites: connections (DNS, TCP, TLS) are opened ahead of the click,
  // with a second one on hover for the page's styles and scripts.
  handle('speeddial:warm', (_c, urls: string[], hover?: boolean) => {
    const dial = new Set(getSettings().speedDial.map((d) => d.url))
    for (const url of urls.filter((u) => dial.has(u)).slice(0, 12)) {
      session.defaultSession.preconnect({ url, numSockets: hover ? 2 : 1 })
    }
  })
  handle('perf:usage', () => {
    const tabs = [...BrowserWin.all].flatMap((w) => w.tabs)
    return {
      memoryMB: Math.round(app.getAppMetrics().reduce((n, m) => n + m.memory.workingSetSize, 0) / 1024),
      tabs: tabs.length,
      sleeping: tabs.filter((t) => t.sleeping).length,
      totalGB: Math.round(totalmem() / 1024 ** 3)
    }
  })
  handle('app:restart', () => restartApp())
  // The video toolbar's Pop out button (top frames only; videos in frames use Chromium's own).
  ipcMain.on('ovyra:float', (event, on: boolean) => {
    const tab = tabsByContents.get(event.sender.id)
    const bw = tab && BrowserWin.fromWebContents(event.sender)
    if (!tab || !bw || event.senderFrame !== event.sender.mainFrame) return
    if (on) bw.floatTab(tab)
    else bw.activate(tab)
  })
  // The video toolbar's screenshot button: a PNG of the frame (or of the screen, for videos
  // from other sites), saved to PicturesOvyra and copied.
  ipcMain.handle('ovyra:video-shot', async (event, data: string | null, title: string, rect: Rect | null) => {
    if (!tabsByContents.has(event.sender.id)) return null
    let image = data?.startsWith('data:image/png;base64,') ? nativeImage.createFromDataURL(data) : null
    if (!image && rect) {
      const zoom = event.sender.getZoomFactor()
      image = await event.sender.capturePage({
        x: Math.round(rect.x * zoom),
        y: Math.round(rect.y * zoom),
        width: Math.round(rect.width * zoom),
        height: Math.round(rect.height * zoom)
      })
    }
    if (!image || image.isEmpty()) return null
    const dir = join(app.getPath('pictures'), 'Ovyra')
    mkdirSync(dir, { recursive: true })
    const base = String(title).replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'Video'
    const file = join(dir, `${base} ${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.png`)
    const png = image.toPNG()
    writeFileSync(file, png)
    void clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' }) })]).catch(() => {})
    return file
  })
  // The color picker copies what was picked.
  shell('color:picked', ({ bw }, hex: string) => {
    if (/^#[0-9a-f]{6}$/i.test(hex)) void clipboard.writeText(hex)
    bw?.hideOverlay()
  })
  // Default browser: Windows only lets the user choose it, in its own Settings.
  let defaultPromptHidden = false
  handle('defaultbrowser:status', async () => ({
    isDefault: await isDefaultBrowser(),
    prompt: getSettings().askDefaultBrowser && getSettings().onboarded && !defaultPromptHidden
  }))
  handle('defaultbrowser:open', () => openDefaultAppsSettings())
  handle('defaultbrowser:dismiss', (_c, forever: boolean) => {
    defaultPromptHidden = true
    if (forever) updateSettings({ askDefaultBrowser: false })
  })
  handle('app:info', () => ({
    version: app.getVersion(),
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    userData: app.getPath('userData'),
    downloads: app.getPath('downloads'),
    gpu: app.isHardwareAccelerationEnabled()
  }))

  // ---- privacy ----
  handle('shields:info', ({ bw }, tabId: number): ShieldsInfo | null => {
    const tab = bw?.tab(tabId)
    if (!tab) return null
    const url = tab.pageUrl()
    const stats = blockStats()
    return {
      site: siteOf(url),
      enabled: shieldsEnabled(url),
      globallyOff: !getSettings().adblock,
      blocked: tab.blocked,
      hosts: [...tab.blockedHosts].sort((a, b) => b[1] - a[1]).slice(0, 8),
      totalBlocked: stats.blocked,
      since: stats.since
    }
  })
  handle('shields:set', (_c, site: string, enabled: boolean) => {
    setSiteShields(site, enabled)
    // Reload every open tab of that site so the change takes effect.
    for (const w of BrowserWin.all) {
      for (const t of w.tabs) if (!t.sleeping && siteOf(t.pageUrl()) === site) t.reload()
      w.tabChanged()
    }
  })
  handle('shields:exceptions', () => shieldExceptions())
  handle('shields:stats', () => blockStats())
  handle('filters:status', () => filterStatus())
  handle('filters:update', () => updateFilters())
  handle('page:context', ({ bw }) => ({ private: !!bw?.incognito, workspaceId: bw?.workspaceId ?? null }))

  // ---- workspaces ----
  shell('workspace:switch', ({ bw }, id: string) => bw?.switchWorkspace(id))
  shell('workspace:menu', ({ bw }, id: string, x: number, y: number) => {
    if (!bw) return
    const many = getSettings().workspaces.length > 1
    showMenu(bw, [
      { label: 'Edit workspace…', click: () => bw.send('edit-workspace', id) },
      { label: 'Delete workspace…', enabled: many, click: () => void deleteWorkspace(bw, id) }
    ], x, y)
  })
  handle('workspace:save', ({ bw }, ws: Workspace) => {
    const list = getSettings().workspaces
    const exists = list.some((w) => w.id === ws.id)
    const clean: Workspace = { id: ws.id || randomUUID(), name: ws.name.trim() || 'Workspace', icon: ws.icon, accent: ws.accent ?? null }
    updateSettings({ workspaces: exists ? list.map((w) => (w.id === ws.id ? clean : w)) : [...list, clean] })
    if (!exists) bw?.switchWorkspace(clean.id)
    for (const w of BrowserWin.all) w.contextChanged()
    return clean
  })
  handle('workspace:delete', ({ bw }, id: string) => bw && deleteWorkspace(bw, id))

  // ---- command palette, split view ----
  shell('palette:open', ({ bw }) => bw?.openPalette())
  shell('palette:data', ({ bw }) => ({
    tabs: (bw?.tabs ?? []).map((t) => ({ ...t.state(), workspaceId: t.workspaceId })),
    activeId: bw?.activeId ?? null
  }))
  shell('palette:run', ({ bw }, cmd: string, arg?: string) => bw && runCommand(bw, cmd, arg))
  shell('split:exit', ({ bw }) => bw?.unsplit())

  // ---- updates ----
  handle('update:state', () => updateState())
  handle('update:check', () => checkForUpdates())
  handle('update:install', () => installUpdate())

  // ---- extensions & import ----
  handle('extensions:list', () => listExtensions())
  handle('extensions:remove', (_c, id: string) => removeExtension(id))
  handle('import:sources', () => importSources())
  handle('import:run', (_c, id: string, what: { bookmarks: boolean; history: boolean; speedDial: boolean }) => runImport(id, what))

  // ---- tab islands ----
  shell('island:toggle', ({ bw }, id: number) => bw?.toggleIsland(id))

  // ---- side panels ----
  shell('layout:panel', ({ bw }, rect: Rect) => bw?.setPanelRect(rect))
  shell('panel:toggle', ({ bw }, id: string) => bw && togglePanel(bw, id))
  shell('panel:hide', ({ bw }) => bw && hidePanel(bw))
  shell('panel:reload', (_c, id: string) => reloadPanel(id))
  shell('panel:width', (_c, width: number) => updateSettings({ panelWidth: Math.round(Math.min(Math.max(width, 300), 900)) }))
  shell('panel:openInTab', ({ bw }, id: string) => {
    const item = getSettings().panels.find((p) => p.id === id)
    if (item && bw) bw.newTab(item.url)
  })
  shell('panel:menu', ({ bw }, id: string, x: number, y: number) => {
    if (!bw) return
    const state = panelStates().find((p) => p.id === id)
    showMenu(bw, [
      { label: 'Reload', enabled: !!state?.loaded, click: () => reloadPanel(id) },
      { label: 'Unload (free memory)', enabled: !!state?.loaded, click: () => destroyPanel(id) },
      { type: 'separator' },
      { label: 'Remove from sidebar', click: () => removePanel(id) }
    ], x, y)
  })
  handle('panels:add', ({ bw }, item: PanelItem) => {
    const list = getSettings().panels
    const id = list.some((p) => p.id === item.id) || !item.id ? randomUUID() : item.id
    updateSettings({ panels: [...list, { ...item, id }] })
    if (bw) showPanel(bw, id)
  })
  handle('panels:remove', (_c, id: string) => removePanel(id))
  handle('window:newPrivate', () => void BrowserWin.open({ incognito: true }))

  /** An internal page navigating its own tab (e.g. the new tab page's search box). */
  /** The new tab page's search box: a query with a chosen engine, or an address. */
  handle('page:search', ({ bw, sender }, input: string, engine: SearchEngineId) => {
    const tab = bw?.tabs.find((t) => t.wc === sender)
    const text = input.trim()
    if (!tab || !text) return
    const url = toUrl(text) ?? searchUrl(text, engine)
    tab.load(url)
    tab.wc?.focus()
  })

  handle('page:navigate', ({ bw, sender }, input: string) => {
    const tab = bw?.tabs.find((t) => t.wc === sender)
    const url = resolveInput(input)
    if (tab && url) tab.load(url)
  })

  /** Everything the command palette can do. */
  function runCommand(bw: BrowserWin, cmd: string, arg?: string): void {
    const wc = bw.active?.wc
    const s = getSettings()
    const commands: Record<string, () => void> = {
      'new-tab': () => bw.newTab(),
      'new-window': () => BrowserWin.open(),
      'new-private': () => BrowserWin.open({ incognito: true }),
      'reopen-tab': () => bw.reopenClosed(),
      'close-tab': () => bw.active && bw.closeTab(bw.active),
      'pin-tab': () => bw.active && bw.setPinned(bw.active, !bw.active.pinned),
      'duplicate-tab': () => bw.active && bw.duplicate(bw.active),
      'split-view': () => (bw.split ? bw.unsplit() : bw.active && bw.splitWith(bw.active)),
      history: () => bw.openInternal('history'),
      bookmarks: () => bw.openInternal('bookmarks'),
      downloads: () => bw.openInternal('downloads'),
      settings: () => bw.openInternal('settings'),
      extensions: () => bw.openInternal('extensions'),
      palette: () => bw.openPalette(),
      'web-store': () => bw.newTab('https://chromewebstore.google.com/'),
      'bookmarks-bar': () => updateSettings({ showBookmarksBar: !s.showBookmarksBar }),
      bookmark: () => bw.toggleBookmarkActive(),
      find: () => bw.openFind(),
      'zoom-in': () => wc && stepZoom(wc, 1),
      'zoom-out': () => wc && stepZoom(wc, -1),
      'zoom-reset': () => wc && stepZoom(wc, 0),
      print: () => wc?.print(),
      fullscreen: () => bw.toggleFullscreen(),
      devtools: () => bw.active && bw.toggleDevTools(bw.active),
      mode: () => arg && updateSettings({ appearance: { ...s.appearance, mode: arg as ColorMode } }),
      'install-update': () => installUpdate(),
      exit: () => app.quit(),
      restart: () => restartApp(),
      'color-picker': () => void bw.pickColor(),
      'toggle-adblock': () => updateSettings({ adblock: !s.adblock }),
      'site-shields': () => {
        const url = bw.active?.pageUrl()
        if (!url || !/^https?:/.test(url)) return
        setSiteShields(siteOf(url), !shieldsEnabled(url))
        bw.active?.reload()
      },
      'update-filters': () => void updateFilters(),
      'tab': () => {
        const tab = bw.tab(Number(arg))
        if (tab) bw.activate(tab)
      },
      workspace: () => arg && bw.switchWorkspace(arg),
      panel: () => arg && showPanel(bw, arg),
      open: () => arg && bw.navigate(arg)
    }
    commands[cmd]?.()
  }

  function removePanel(id: string): void {
    updateSettings({ panels: getSettings().panels.filter((p) => p.id !== id) })
  }

  async function deleteWorkspace(bw: BrowserWin, id: string): Promise<void> {
    const list = getSettings().workspaces
    const ws = list.find((w) => w.id === id)
    if (!ws || list.length < 2) return
    const count = [...BrowserWin.all].reduce((n, w) => n + w.tabs.filter((t) => t.workspaceId === id).length, 0)
    const { response } = await dialog.showMessageBox(bw.win, {
      type: 'warning',
      message: `Delete the “${ws.name}” workspace?`,
      detail: count ? `Its ${count} tab${count === 1 ? '' : 's'} will be closed.` : undefined,
      buttons: ['Delete', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      noLink: true
    })
    if (response !== 0) return
    const rest = list.filter((w) => w.id !== id)
    updateSettings({ workspaces: rest })
    for (const w of BrowserWin.all) w.workspaceRemoved(id, rest[0].id)
  }

  onSettingsChanged((s) => {
    broadcast('settings', s)
    for (const w of BrowserWin.all) w.tabChanged()
  })
  bookmarks.onBookmarksChanged(() => {
    broadcast('bookmarks', bookmarks.allBookmarks())
    for (const w of BrowserWin.all) w.tabChanged()
  })
}
