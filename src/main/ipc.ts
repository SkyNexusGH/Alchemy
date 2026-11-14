import { app, clipboard, ClipboardItem, dialog, ipcMain, nativeImage, session, type WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { totalmem } from 'node:os'
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { toUrl } from '@shared/url'
import type { AutofillAddress, InternalPage, OverlayPayload, PanelItem, Rect, SearchEngineId, Settings, ShieldsInfo, SiteRestyle, UserScript, TabAudio, Workspace, ToastData } from '@shared/types'
import { isDefaultBrowser, openDefaultAppsSettings } from './defaultbrowser'
import { listExtensions, removeExtension } from './extensions'
import { importSources, runImport } from './importer'
import { chooseMenuItem, showMenu } from './popup'
import { addLater, laterItems, removeLater, setLaterRead } from './later'
import { toggleReader } from './reader'
import { allowDangerousSite } from './privacy/network'
import { destroyPanel, hidePanel, panelStates, panelPreview, presetIcons, setPanelDesktop, reloadPanel, showPanel, togglePanel } from './panels'
import { stepZoom, tabsByContents } from './tab'
import { checkForUpdates, installUpdate, updateState } from './updater'
import * as bookmarks from './bookmarks'
import { isAwakeSite, setAwakeSite } from './awake'
import { broadcast } from './broadcast'
import { hostOf } from '@shared/url'
import { clearDownloads, downloadAction, listDownloads } from './downloads'
import * as history from './history'
import { appMenu, appMenuInfo, bookmarkFolderMenu, islandMenu, tabContextMenu } from './menus'
import { localSuggestions, remoteSuggestions, resolveInput, searchUrl } from './omnibox'
import { clearPermissionDecisions, listPermissionDecisions, setPermissionDecision } from './permissions'
import { filterStatus, updateFilters } from './privacy/engine'
import { blockStats, setSiteShields, shieldExceptions, shieldsEnabled, siteOf } from './privacy/shields'
import { isInternalUrl, userAssetsDir, WALLPAPER } from './protocol'
import { getSettings, onSettingsChanged, updateSettings } from './settings'
import { newTorIdentity, retryTor, torStatus } from './tor'
import { baseLang, restorePage, translatePage } from './translate'
import { batterySaverActive } from './battery'
import { listAutofill, removeAutofill, saveAddress, saveCard } from './autofill'
import { addPassword, checkAllBreaches, copyPassword, generatePassword, importPasswordsCsv, listPasswords, loadPasswords, neverSaveFor, passwordsEncrypted, removeAllPasswords, removePassword, revealPassword, savePending, updatePassword } from './passwords'
import { aiDocs, searchTabs, webSnippets } from './pagetext'
import { allRestyles, copyRestyle, elixirList, installScript, listScripts, pickAndHide, restyleFor, saveScripts, setRestyle, undoLastHide, updateElixirs, updateScripts } from './sitemods'
import { findPlaces, focusState, news, startFocus, stopFocus, weather } from './widgets'

/** Fresh Tor circuits and cookies, then the Tor window's tabs reload through them. */
async function newIdentity(bw: BrowserWin): Promise<boolean> {
  const ok = await newTorIdentity()
  if (ok) for (const w of BrowserWin.all) if (w.tor) for (const t of w.tabs) t.reload()
  bw.send('toast', { text: ok ? 'New identity: fresh Tor circuits, cookies cleared' : 'Couldn’t get a new identity' } satisfies ToastData)
  return ok
}

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

/** Translates a tab into your language, or puts it back. */
async function translateTab(bw: BrowserWin, tab: NonNullable<BrowserWin['active']>): Promise<void> {
  const wc = tab.wc
  if (!wc) return
  if (tab.translated) {
    await restorePage(wc)
    tab.translated = false
  } else {
    const target = getSettings().translateTo || baseLang(app.getLocale())
    const res = await translatePage(wc, target)
    tab.translated = res.ok
    if (!res.ok) bw.send('toast', { text: 'Couldn’t translate this page' } satisfies ToastData)
  }
  bw.tabChanged()
}

const GAME_URL = 'alchemy://error/?game=1'

// The AI models are kept in the browser's cache for Alchemy's own window (see aiWorker.ts).
const modelsScript = (remove?: 'ai' | 'smart' | 'voice'): string => `(async () => {
  const cache = await caches.open('transformers-cache')
  const sizes = { ai: 0, smart: 0, voice: 0 }
  for (const req of await cache.keys()) {
    const kind = req.url.includes('whisper') ? 'voice' : req.url.includes('Qwen') ? 'smart' : 'ai'
    if (kind === ${JSON.stringify(remove ?? '')}) { await cache.delete(req); continue }
    const res = await cache.match(req)
    sizes[kind] += Number(res?.headers.get('content-length') ?? 0)
  }
  return sizes
})()`

function restartApp(): void {
  app.relaunch()
  app.quit()
}

export function registerIpc(): void {
  // ---- window UI ----
  shell('window:state', ({ bw }) => bw?.state())
  shell('layout:content', ({ bw }, rect: Rect) => bw?.setContentRect(rect))
  shell('tab:new', ({ bw }) => bw?.userNewTab())
  // A page started or stopped using the camera, microphone or screen.
  ipcMain.on('alchemy:capture', (event, on: boolean) => {
    const bw = BrowserWin.fromWebContents(event.sender)
    const tab = bw?.tabs.find((t) => t.wc === event.sender)
    const frame = event.senderFrame?.frameTreeNodeId
    if (!bw || !tab || frame === undefined) return
    if (on) tab.capturing.add(frame)
    else tab.capturing.delete(frame)
    bw.tabChanged()
  })
  shell('tab:activate', ({ bw }, id: number) => {
    const tab = bw?.tab(id)
    if (tab) bw!.activate(tab)
  })
  shell('tab:close', ({ bw }, id: number) => {
    const tab = bw?.tab(id)
    if (tab) bw!.closeTab(tab)
  })
  shell('tab:audio', ({ bw }, id: number, patch: Partial<TabAudio>) => bw?.tab(id)?.setAudio(patch))
  shell('tabcard:show', ({ bw }, rect: Rect, id: number) => bw?.showTabCard(rect, id))
  shell('tabcard:hide', ({ bw }) => bw?.hideTabCard())
  // The pointer moved onto (or off) the card, so the tab strip keeps it open (or closes it).
  shell('tabcard:hover', ({ bw }, over: boolean) => bw?.send('tabcard:hover', over))
  /** A tab's state plus the memory its process uses, in MB (null while it sleeps). */
  shell('tab:info', ({ bw }, id: number) => {
    const tab = bw?.tab(id)
    if (!tab) return null
    const wc = tab.wc
    const metric = wc && !wc.isDestroyed() ? app.getAppMetrics().find((m) => m.pid === wc.getOSProcessId()) : undefined
    return { ...tab.state(), memoryMB: metric ? Math.round(metric.memory.workingSetSize / 1024) : null }
  })
  // A small picture of the tab's page for its hover card.
  shell('tab:preview', ({ bw }, id: number) => bw?.tabPreview(id) ?? null)
  shell('bmcard:show', ({ bw }, rect: Rect, payload: Extract<OverlayPayload, { kind: 'bmcard' }>) =>
    bw?.showBookmarkCard(rect, payload)
  )
  shell('bmcard:hide', ({ bw }) => bw?.hideBookmarkCard())
  shell('panelcard:show', ({ bw }, rect: Rect, payload: Extract<OverlayPayload, { kind: 'panelcard' }>) => bw?.showPanelCard(rect, payload))
  shell('panel:preview', (_c, id: string) => panelPreview(id))
  shell('switcher:pick', ({ bw }, id: number) => bw?.finishSwitcher(id))
  shell('bookmark:preview', ({ bw }, url: string) => bw?.bookmarkPreview(url) ?? null)
  // Translate (Google Translate) or put the original back.
  shell('tab:translate', async ({ bw }, id: number) => {
    const tab = bw?.tab(id)
    if (tab) await translateTab(bw!, tab)
  })
  shell('tab:pin', ({ bw }, id: number) => {
    const tab = bw?.tab(id)
    if (tab) bw!.setPinned(tab, !tab.pinned)
  })
  shell('tab:move', ({ bw }, id: number, to: number) => bw?.moveTab(id, to))
  shell('tab:mute', ({ bw }, id: number) => {
    const tab = bw?.tab(id)
    tab?.setMuted(!tab.muted)
  })
  shell('tab:menu', ({ bw }, id: number, x: number, y: number, selected: number[] = []) => {
    const tab = bw?.tab(id)
    const tabs = selected.map((s) => bw?.tab(s)).filter((t): t is NonNullable<typeof t> => !!t)
    if (tab) tabContextMenu(bw!, tab, x, y, tabs)
  })
  shell('island:menu', ({ bw }, id: number, x: number, y: number) => bw && islandMenu(bw, id, x, y))
  shell('island:rename', ({ bw }, id: number, name: string) => bw?.renameIsland(id, String(name ?? '')))
  shell('island:color', ({ bw }, id: number, color: string) => /^#[0-9a-f]{6}$/i.test(color) && bw?.setIslandColor(id, color))
  shell('island:join', ({ bw }, tabId: number, id: number) => {
    const tab = bw?.tab(tabId)
    if (tab) bw!.joinGroup(tab, id)
  })
  // A tab dragged off the strip: into the window under the pointer, or a new one there.
  shell('tab:detach', ({ bw }, id: number, x: number, y: number) => {
    const tab = bw?.tab(id)
    if (!tab || !bw) return
    const target = BrowserWin.windowAt(x, y, bw)
    if (target || bw.tabs.length > 1) bw.moveTabToWindow(tab, target, { x, y })
  })
  // Text or a link dropped on the tab strip opens as a new tab there.
  shell('tab:drop', ({ bw }, text: string, index: number) => {
    const url = resolveInput(String(text ?? '').trim())
    if (bw && url) bw.newTab(url, { index })
  })
  shell('split:ratio', ({ bw }, ratio: number) => bw?.setSplitRatio(Number(ratio) || 0.5))
  shell('split:swap', ({ bw }) => bw?.swapSplit())
  shell('split:direction', ({ bw }) => bw?.toggleSplitDirection())
  // A tab dropped on the edge of the page starts a split view with it.
  shell('split:with', ({ bw }, id: number) => {
    const tab = bw?.tab(id)
    if (tab && bw!.active && tab !== bw!.active) bw!.splitWith(bw!.active, tab)
  })
  shell('tab:navigate', ({ bw }, input: string, opts?: { newTab?: boolean; background?: boolean; engine?: string }) =>
    bw?.navigate(input, opts)
  )
  // #308 Right-click Back or Forward: the pages you can go back (or forward) to.
  shell('nav:menu', ({ bw }, dir: 'back' | 'forward', x: number, y: number) => {
    const nav = bw?.active?.wc?.navigationHistory
    if (!bw || !nav) return
    const entries = nav.getAllEntries()
    const at = nav.getActiveIndex()
    const list = dir === 'back' ? entries.slice(Math.max(0, at - 12), at).map((e, i, arr) => ({ e, index: at - arr.length + i })).reverse() : entries.slice(at + 1, at + 13).map((e, i) => ({ e, index: at + 1 + i }))
    if (!list.length) return
    showMenu(
      bw,
      [
        ...list.map(({ e, index }) => ({ label: (e.title || e.url).slice(0, 70), click: () => nav.goToIndex(index) })),
        { type: 'separator' as const },
        { label: 'Show full history', click: () => bw.openInternal('history') }
      ],
      x,
      y
    )
  })
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
  handle('omnibox:remote', ({ bw }, text: string, engine?: SearchEngineId) => (bw?.incognito ? [] : remoteSuggestions(text, engine)))
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
  handle('internal:open', ({ bw }, page: InternalPage, section?: string) => bw?.openInternal(page, typeof section === 'string' ? section : undefined))

  // ---- any internal page ----
  handle('settings:get', () => getSettings())
  handle('settings:set', (_c, patch: Partial<Settings>) => updateSettings(patch))

  handle('history:query', (_c, text: string, before?: number) => history.queryVisits(text ?? '', 300, before ?? Infinity))
  handle('history:delete', (_c, url: string, time: number) => history.deleteVisit(url, time))
  shell('history:forget', (_c, url: string) => history.forgetUrl(String(url)))
  handle('history:top', (_c, n: number) => history.topSites(n))
  handle('history:mostVisited', (_c, range: 'week' | 'all') => history.mostVisited(range === 'all' ? 'all' : 'week'))
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
  handle('bookmarks:undo', () => bookmarks.undoRemove())
  handle('later:list', () => laterItems())
  shell('later:open', ({ bw }, url: string, newTab = false) => {
    setLaterRead(url, true)
    bw?.navigate(url, { newTab })
  })
  handle('later:read', (_c, url: string, read: boolean) => setLaterRead(url, read))
  handle('later:remove', (_c, url?: string) => removeLater(url))
  handle('bookmarks:export', async ({ bw }) => {
    const { canceled, filePath } = await dialog.showSaveDialog(bw!.win, {
      title: 'Export bookmarks',
      defaultPath: join(app.getPath('documents'), `Alchemy bookmarks ${new Date().toISOString().slice(0, 10)}.html`),
      filters: [{ name: 'Bookmark file', extensions: ['html'] }]
    })
    if (canceled || !filePath) return null
    writeFileSync(filePath, bookmarks.exportHtml(), 'utf8')
    return filePath
  })
  handle('bookmarks:importFile', async ({ bw }) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(bw!.win, {
      title: 'Import bookmarks from a file',
      filters: [{ name: 'Bookmark file (HTML)', extensions: ['html', 'htm'] }],
      properties: ['openFile']
    })
    if (canceled || !filePaths[0]) return null
    return bookmarks.importHtml(readFileSync(filePaths[0], 'utf8'))
  })

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

  /** Lets the user pick their own new tab background; a copy is kept with Alchemy's data. */
  handle('appearance:pickBackground', async ({ sender }) => {
    const owner = BrowserWin.fromWebContents(sender)?.win
    const opts: Electron.OpenDialogOptions = {
      title: 'Choose a background image',
      properties: ['openFile'],
      filters: [{ name: 'Images or short videos', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'mp4', 'webm'] }]
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
  // #175 A folder of your own pictures, a different one each new tab.
  handle('appearance:pickFolder', async ({ sender }) => {
    const owner = BrowserWin.fromWebContents(sender)?.win
    const opts: Electron.OpenDialogOptions = { title: 'Choose a folder of pictures', properties: ['openDirectory'] }
    const res = owner ? await dialog.showOpenDialog(owner, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled || !res.filePaths[0]) return null
    const count = readdirSync(res.filePaths[0]).filter((f) => WALLPAPER.test(f)).length
    if (!count) return 0
    updateSettings({ appearance: { ...getSettings().appearance, background: 'folder', wallpaperFolder: res.filePaths[0] } })
    return count
  })
  handle('appearance:nextWallpaper', () => {
    const dir = getSettings().appearance.wallpaperFolder
    if (!dir) return null
    try {
      const files = readdirSync(dir).filter((f) => WALLPAPER.test(f))
      return files.length ? files[Math.floor(Math.random() * files.length)] : null
    } catch {
      return null
    }
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
  ipcMain.on('alchemy:float', (event, on: boolean) => {
    const tab = tabsByContents.get(event.sender.id)
    const bw = tab && BrowserWin.fromWebContents(event.sender)
    if (!tab || !bw || event.senderFrame !== event.sender.mainFrame) return
    if (on) bw.floatTab(tab)
    else bw.activate(tab)
  })
  // The video toolbar's screenshot button: a PNG of the frame (or of the screen, for videos
  // from other sites), saved to PicturesAlchemy and copied.
  ipcMain.handle('alchemy:video-shot', async (event, data: string | null, title: string, rect: Rect | null) => {
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
    const dir = join(app.getPath('pictures'), 'Alchemy')
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
    const n = (getSettings().defaultPromptDismissals ?? 0) + 1
    updateSettings({ defaultPromptDismissals: n, ...(forever || n >= 2 ? { askDefaultBrowser: false } : {}) })
  })
  handle('app:info', () => ({
    version: app.getVersion(),
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    userData: app.getPath('userData'),
    downloads: app.getPath('downloads'),
    gpu: app.isHardwareAccelerationEnabled()
  }))

  // ---- new tab widgets ----
  handle('widgets:places', (_c, q: string) => findPlaces(q).catch(() => []))
  // "weather paris" in the address bar: the first matching place's weather.
  // #104 Currency: today's European Central Bank rates (only the two currency codes are sent).
  handle('omnibox:currency', async ({ bw }, amount: number, from: string, to: string) => {
    if (bw?.incognito || !/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) return null
    try {
      const res = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`)
      const data = (await res.json()) as { rates?: Record<string, number>; date?: string }
      const rate = data.rates?.[to]
      return rate ? { value: amount * rate, rate, date: data.date ?? '' } : null
    } catch {
      return null
    }
  })
  handle('omnibox:weather', async ({ bw }, q: string) => {
    if (bw?.incognito) return null
    const place = (await findPlaces(q).catch(() => []))[0]
    if (!place) return null
    const w = await weather(place.lat, place.lon, getSettings().tempUnit ?? 'C')
    return w ? { ...w, place: place.name } : null
  })
  handle('widgets:weather', (_c, lat: number, lon: number, unit: 'C' | 'F') => weather(lat, lon, unit))
  handle('widgets:news', () => news(getSettings().newsFeeds ?? []))
  handle('widgets:recent', ({ bw }) => bw?.recentlyClosed(4) ?? [])
  handle('widgets:reopen', ({ bw }, fromEnd: number) => bw?.reopenClosedAt(fromEnd))
  handle('widgets:focus', () => focusState())
  handle('widgets:focusStart', (_c, minutes: number) => startFocus(Math.max(1, Math.min(180, minutes))))
  handle('widgets:focusStop', () => stopFocus())

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
      trackers: tab.trackers,
      split: getSettings().splitBlockCounts,
      hosts: [...tab.blockedHosts].sort((a, b) => b[1] - a[1]).slice(0, 8),
      totalBlocked: stats.blocked,
      totalAds: stats.ads,
      totalTrackers: stats.trackers,
      since: stats.since,
      siteLevel: getSettings().aegisSiteLevels?.[siteOf(url)],
      fingerprintOff: (getSettings().fingerprintOff ?? []).includes(siteOf(url))
    }
  })
  // #396 One site's own Aegis level ('' goes back to the global one); the page reloads.
  handle('shields:siteLevel', ({ bw }, site: string, level: '' | 'chill' | 'comfort' | 'extreme') => {
    const levels = { ...(getSettings().aegisSiteLevels ?? {}) }
    if (level) levels[site] = level
    else delete levels[site]
    updateSettings({ aegisSiteLevels: levels })
    // Give the other level's engine a moment to load before the reload.
    setTimeout(() => bw?.active?.reload(), 600)
  })
  // #447 Fingerprint protection off (or back on) for one site.
  handle('shields:fingerprint', ({ bw }, site: string, on: boolean) => {
    const list = (getSettings().fingerprintOff ?? []).filter((s) => s !== site)
    updateSettings({ fingerprintOff: on ? list : [...list, site] })
    bw?.active?.reload()
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
  handle('page:context', ({ bw }) => ({ private: !!bw?.incognito, tor: !!bw?.tor, workspaceId: bw?.workspaceId ?? null }))

  // ---- Alchemy Tor ----
  handle('tor:status', () => torStatus())
  // ---- site mods: Force dark, Elixirs, MyHue Restyle, custom scripts ----
  handle('mods:site', ({ bw }) => {
    const url = bw?.active?.pageUrl() ?? ''
    if (!/^https?:/.test(url)) return null
    const site = siteOf(url)
    return { site, restyle: restyleFor(site), elixirs: elixirList().filter((e) => e.sites.includes(site)) }
  })
  handle('mods:elixirs', () => elixirList())
  handle('mods:refreshElixirs', async () => (await updateElixirs(true), elixirList()))
  handle('mods:copyRestyle', (_c, from: string, to: string) => copyRestyle(from, to))
  handle('mods:installScript', (_c, url: string) => installScript(String(url ?? '').trim()))
  handle('mods:updateScripts', () => updateScripts())
  handle('mods:restyles', () => allRestyles())
  handle('mods:setRestyle', (_c, site: string, r: SiteRestyle | null) => setRestyle(site, r))
  handle('mods:scripts', () => listScripts())
  handle('mods:saveScripts', ({ bw }, scripts: UserScript[]) => {
    saveScripts(scripts)
    bw?.active?.reload()
  })
  shell('mods:pick', async ({ bw }) => {
    const wc = bw?.active?.wc
    if (!wc) return
    bw!.hideOverlay()
    wc.focus()
    const hidden = await pickAndHide(wc)
    if (hidden) bw!.send('toast', { text: hidden === 1 ? 'Hidden on this site' : `${hidden} things hidden on this site`, action: { label: 'Undo', cmd: 'restyle-undo' } } satisfies ToastData)
  })
  // ---- on-device AI: the text it reads comes from here, the thinking happens in the shell ----
  // AI features stay off in Masked Mode and Alchemy Tor.
  shell('ai:docs', async ({ bw }, scope: 'page' | 'tabs' | 'selection') => {
    if (!bw || bw.incognito) return []
    if (scope === 'selection') {
      const tab = bw.active
      const text = ((await tab?.wc?.executeJavaScript('String(getSelection() || "")', true).catch(() => '')) as string) ?? ''
      return tab && text.trim().length > 20 ? [{ id: tab.id, title: tab.title, url: tab.pageUrl(), text: text.trim() }] : []
    }
    return aiDocs(scope === 'page' ? (bw.active ? [bw.active] : []) : bw.visible())
  })
  // How much is selected on the page, so Ask can offer to ask about just that.
  shell('ai:selection', async ({ bw }) => {
    const text = ((await bw?.active?.wc?.executeJavaScript('String(getSelection() || "")', true).catch(() => '')) as string) ?? ''
    return text.trim().length > 20 ? text.trim().slice(0, 120) : ''
  })
  // "Show me where": bring up the tab and find the words on it.
  shell('ai:show', ({ bw }, tabId: number, words: string) => {
    const tab = bw?.tab(tabId)
    if (!tab) return
    bw!.activate(tab)
    tab.wc?.findInPage(words)
    setTimeout(() => tab.wc?.stopFindInPage('keepSelection'), 2500)
  })
  shell('ai:web', ({ bw }, q: string) => {
    const lab = getSettings().lab
    return bw?.incognito || !lab?.ask || !lab.instantAnswers ? [] : webSnippets(q)
  })
  handle('ai:modelSizes', ({ bw }) => bw?.win.webContents.executeJavaScript(modelsScript()) ?? { ai: 0, smart: 0, voice: 0 })
  handle('ai:removeModels', ({ bw }, which: 'ai' | 'smart' | 'voice') => {
    broadcast('ai:models-removed', which)
    return bw?.win.webContents.executeJavaScript(modelsScript(which)) ?? { ai: 0, smart: 0, voice: 0 }
  })
  handle('game:open', ({ bw }) => void bw?.newTab(GAME_URL))
  shell('ask:toggle', ({ bw }) => getSettings().lab?.ask && !bw?.incognito && bw?.send('ask:toggle'))
  shell('search:everywhere', ({ bw }, q: string) => bw?.searchEverywhere(q))
  // Ctrl+K: search the words inside your open tabs (kept in memory only).
  shell('tabs:searchContent', ({ bw }, q: string) => (bw && getSettings().lab?.tabSearch !== false ? searchTabs(bw.visible().filter((t) => t !== bw.active), q) : []))
  // ---- passwords ----
  handle('passwords:list', async () => (await loadPasswords(), listPasswords()))
  handle('passwords:encrypted', async () => (await loadPasswords(), passwordsEncrypted()))
  handle('passwords:reveal', (_c, id: string) => revealPassword(id))
  handle('passwords:remove', (_c, id: string) => removePassword(id))
  handle('passwords:add', (_c, url: string, username: string, password: string) => addPassword(url, username, password))
  handle('passwords:import', () => importPasswordsCsv())
  handle('passwords:checkBreaches', () => checkAllBreaches())
  handle('passwords:update', (_c, id: string, username: string, password: string) => updatePassword(id, String(username ?? ''), String(password ?? '')))
  handle('passwords:removeAll', () => removeAllPasswords())
  handle('autofill:list', () => listAutofill())
  handle('autofill:saveAddress', (_c, a: AutofillAddress) => saveAddress(a))
  handle('autofill:saveCard', (_c, c: { id?: string; name: string; number: string; expMonth: string; expYear: string }) => saveCard(c))
  handle('autofill:remove', (_c, kind: 'address' | 'card', id: string) => removeAutofill(kind, id))
  handle('passwords:copy', (_c, id: string) => copyPassword(id))
  handle('passwords:generate', (_c, opts?: { length: number; symbols: boolean; readable: boolean }) => generatePassword(opts))
  handle('permissions:list', () => listPermissionDecisions())
  handle('permissions:set', (_c, origin: string, permission: string, allowed: boolean | null) => setPermissionDecision(origin, permission, allowed))
  handle('battery:state', () => batterySaverActive())
  // Choosing bridges (or not) on the connection screen is remembered for next time.
  handle('tor:retry', (_c, bridges?: boolean) => {
    if (typeof bridges === 'boolean') updateSettings({ torBridges: bridges })
    return retryTor(bridges)
  })
  // New identity, then reload the Tor window's tabs so they come back through new circuits.
  // #421 "Open anyway" on the dangerous page warning.
  handle('aegis:allowDanger', ({ bw, sender }, url: string) => {
    allowDangerousSite(url)
    const tab = bw?.tabs.find((t) => t.wc === sender)
    tab?.load(url)
  })
  handle('tor:newIdentity', ({ bw }) => (bw ? newIdentity(bw) : false))
  handle('window:newTor', () => void BrowserWin.open({ tor: true }))

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
    const clean: Workspace = {
      id: ws.id || randomUUID(),
      name: ws.name.trim() || 'Workspace',
      icon: ws.icon,
      accent: ws.accent ?? null,
      homeUrl: ws.homeUrl?.trim() || undefined,
      searchEngine: ws.searchEngine || undefined,
      barFolder: ws.barFolder || undefined,
      panels: Array.isArray(ws.panels) ? ws.panels : undefined
    }
    updateSettings({ workspaces: exists ? list.map((w) => (w.id === ws.id ? clean : w)) : [...list, clean] })
    if (!exists) bw?.switchWorkspace(clean.id)
    for (const w of BrowserWin.all) w.contextChanged()
    return clean
  })
  handle('workspace:delete', ({ bw }, id: string) => bw && deleteWorkspace(bw, id))
  // #67 A copy of a workspace's look and options (not its tabs), ready to rename.
  handle('workspace:duplicate', (_c, id: string) => {
    const list = getSettings().workspaces
    const ws = list.find((w) => w.id === id)
    if (!ws) return
    const copy: Workspace = { ...ws, id: randomUUID(), name: `${ws.name} copy` }
    const at = list.indexOf(ws) + 1
    updateSettings({ workspaces: [...list.slice(0, at), copy, ...list.slice(at)] })
    return copy
  })

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
      { label: 'Use desktop version', type: 'checkbox', checked: !!state?.desktop, click: () => setPanelDesktop(id, !state?.desktop) },
      { label: 'Name, icon and color…', click: () => bw.send('panel:edit', id) },
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
  handle('panels:edit', (_c, id: string, patch: { title?: string; color?: string; badge?: string }) => {
    updateSettings({
      panels: getSettings().panels.map((p) =>
        p.id === id
          ? {
              ...p,
              title: patch.title?.trim().slice(0, 40) || p.title,
              color: /^#[0-9a-f]{6}$/i.test(patch.color ?? '') ? patch.color! : p.color,
              badge: patch.badge?.trim().slice(0, 4) || undefined
            }
          : p
      )
    })
  })
  // #240 One + in the sidebar: it asks what to add.
  shell('rail:addMenu', ({ bw }, x: number, y: number) => {
    if (!bw) return
    showMenu(
      bw,
      [
        ...(bw.incognito ? [] : [{ label: 'New workspace…', click: () => bw.send('rail:add', 'workspace') }]),
        ...(bw.tor ? [] : [{ label: 'Messenger or site in the sidebar…', click: () => bw.send('rail:add', 'panel') }])
      ],
      x,
      y
    )
  })
  shell('panels:presetIcons', () => presetIcons())
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
      'new-tab': () => bw.userNewTab(),
      'new-window': () => BrowserWin.open(),
      'new-private': () => BrowserWin.open({ incognito: true }),
      'new-tor': () => BrowserWin.open({ tor: true }),
      'search-everywhere': () => arg && bw.searchEverywhere(arg),
      'pw-save': () => arg && savePending(arg),
      'pw-never': () => arg && neverSaveFor(arg),
      ask: () => s.lab?.ask && !bw.incognito && bw.send('ask:toggle'),
      back: () => wc?.navigationHistory.goBack(),
      forward: () => wc?.navigationHistory.goForward(),
      reload: () => bw.active?.reload(),
      'scroll-down': () => void wc?.executeJavaScript('scrollBy({ top: innerHeight * 0.8, behavior: "smooth" })').catch(() => {}),
      'scroll-up': () => void wc?.executeJavaScript('scrollBy({ top: -innerHeight * 0.8, behavior: "smooth" })').catch(() => {}),
      restyle: () => bw.openRestyle(),
      'restyle-undo': () => wc && undoLastHide(wc),
      'force-dark': () => updateSettings({ forceDark: !s.forceDark }),
      'reopen-tab': () => bw.reopenClosed(),
      reader: () => wc && void toggleReader(wc).then((r) => r === 'none' && bw.send('toast', { text: 'Reader view couldn’t find an article on this page' })),
      'later-add': () => {
        const t = bw.active
        if (t && !bw.incognito && addLater(t.pageUrl(), t.title, t.favicon)) bw.send('toast', { text: 'Saved to your Later list', action: { label: 'Show', cmd: 'later' } })
      },
      later: () => bw.send('later:show'),
      'tor-identity': () => void newIdentity(bw),
      'reopen-tabs': () => {
        for (let i = 0; i < Math.min(50, Number(arg) || 1); i++) bw.reopenClosed()
      },
      'close-tab': () => bw.active && bw.closeTab(bw.active),
      'pin-tab': () => bw.active && bw.setPinned(bw.active, !bw.active.pinned),
      'duplicate-tab': () => bw.active && bw.duplicate(bw.active),
      'split-view': () => (bw.split ? bw.unsplit() : bw.active && bw.splitWith(bw.active)),
      'split-swap': () => bw.swapSplit(),
      'split-direction': () => bw.toggleSplitDirection(),
      'mute-others': () => bw.active && bw.muteOthers(bw.active),
      history: () => bw.openInternal('history'),
      bookmarks: () => bw.openInternal('bookmarks'),
      downloads: () => bw.openInternal('downloads'),
      settings: () => bw.openInternal('settings', arg),
      translate: () => bw.active && void translateTab(bw, bw.active),
      'mute-tab': () => bw.active?.setMuted(!bw.active.muted),
      'sleep-others': () => {
        const tabs = bw.sleepCandidates()
        for (const t of tabs) bw.sleepTab(t)
        bw.send('toast', { text: tabs.length ? `${tabs.length} ${tabs.length === 1 ? 'tab' : 'tabs'} put to sleep` : 'No tabs to put to sleep' } satisfies ToastData)
      },
      'keep-awake': () => {
        const url = bw.active?.pageUrl()
        if (!url || !/^https?:/.test(url)) return
        const on = !isAwakeSite(url)
        setAwakeSite(url, on)
        bw.send('toast', { text: `${hostOf(url)} ${on ? 'will stay awake' : 'can go to sleep again'}` } satisfies ToastData)
      },
      'view-source': () => bw.active && bw.newTab(`view-source:${bw.active.pageUrl()}`, { opener: bw.active }),
      game: () => bw.newTab(GAME_URL),
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
      'install-update': () => installUpdate(),
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
    const rest = list.filter((w) => w.id !== id)
    // #78 With tabs in it, they can move to another workspace instead of closing.
    const target = rest.find((w) => w.id === bw.workspaceId) ?? rest[0]
    const tabs = `${count} tab${count === 1 ? '' : 's'}`
    const { response } = await dialog.showMessageBox(bw.win, {
      type: 'warning',
      message: `Delete the “${ws.name}” workspace?`,
      detail: count ? `It has ${tabs}. Move them to “${target.name}”, or close them?` : undefined,
      buttons: count ? [`Move ${tabs} to ${target.name}`, `Close ${tabs}`, 'Cancel'] : ['Delete', 'Cancel'],
      defaultId: count ? 0 : 1,
      cancelId: count ? 2 : 1,
      noLink: true
    })
    if (count ? response === 2 : response !== 0) return
    if (count && response === 0) {
      for (const w of BrowserWin.all) for (const t of w.tabs.filter((x) => x.workspaceId === id)) w.moveToWorkspace(t, target.id)
    }
    updateSettings({ workspaces: rest })
    for (const w of BrowserWin.all) w.workspaceRemoved(id, target.id)
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
