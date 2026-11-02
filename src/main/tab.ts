import { isFloating } from './float'
import { WebContentsView, type BrowserWindowConstructorOptions, type NavigationEntry, type WebContents } from 'electron'
import { join } from 'node:path'
import { NEW_TAB_URL, type Security, type TabState } from '@shared/types'
import { isBookmarked } from './bookmarks'
import * as history from './history'
import { trackTab } from './extensions'
import { httpsFallback, navigationCommitted } from './privacy/network'
import { shieldsEnabled } from './privacy/shields'
import { isInternalUrl } from './protocol'
import { getSettings } from './settings'

/** Lets network hooks (which only know a webContents id) find the tab a request belongs to. */
export const tabsByContents = new Map<number, Tab>()

export const PRELOAD = join(__dirname, '../preload/index.js')
const ERROR_PAGE = 'ovyra://error/'
const MAX_ENTRIES = 50

export interface TabSnapshot {
  url: string
  title: string
  favicon: string | null
  pinned: boolean
  entries?: NavigationEntry[]
  workspaceId?: string
  islandId?: number | null
  index?: number
}

/** What a tab needs from the window that owns it. */
export interface TabHost {
  readonly session: Electron.Session
  readonly incognito: boolean
  readonly defaultWorkspace: string
  readonly win: Electron.BrowserWindow
  tabChanged(tab: Tab): void
  tabClosedItself(tab: Tab): void
  openFromTab(opener: Tab, options: { foreground: boolean; webContents: WebContents; url: string }): void
  handleKey(input: Electron.Input): boolean
  contextMenu(tab: Tab, params: Electron.ContextMenuParams): void
  foundInPage(tab: Tab, result: Electron.Result): void
  htmlFullscreen(tab: Tab, on: boolean): void
  tabFocused(tab: Tab): void
}

export class Tab {
  private static nextId = 1
  readonly id = Tab.nextId++

  view: WebContentsView | null = null
  url: string
  title: string
  favicon: string | null
  pinned: boolean
  muted = false
  /** Volume boost for the tab's videos (1 = normal, up to 4). */
  boost = 1
  loading = false
  audible = false
  /** When the tab was last in the foreground; drives sleeping tabs. */
  lastActive = Date.now()
  openerId: number | null = null
  /** This tab's DevTools, docked in the window, when open. */
  devtools: WebContentsView | null = null
  workspaceId: string
  islandId: number | null
  blocked = 0
  readonly blockedHosts = new Map<string, number>()

  private saved: { entries: NavigationEntry[]; index: number } | null = null
  private pendingContents: WebContents | null = null
  /** The URL that failed to load while the error page is showing. */
  private failedUrl: string | null = null
  private closingOnPurpose = false

  constructor(
    private readonly host: TabHost,
    init: Partial<TabSnapshot> & { webContents?: WebContents }
  ) {
    this.url = init.url ?? NEW_TAB_URL
    this.title = init.title ?? ''
    this.favicon = init.favicon ?? null
    this.pinned = init.pinned ?? false
    this.workspaceId = init.workspaceId ?? host.defaultWorkspace
    this.islandId = init.islandId ?? null
    if (init.entries?.length) this.saved = { entries: init.entries, index: init.index ?? init.entries.length - 1 }
    if (init.webContents) this.pendingContents = init.webContents
  }

  get wc(): WebContents | null {
    return this.view?.webContents ?? null
  }

  get sleeping(): boolean {
    return !this.view
  }

  get isNewTab(): boolean {
    return this.url.startsWith(NEW_TAB_URL)
  }

  /** Creates the page (if asleep) and returns its view. */
  wake(): WebContentsView {
    if (this.view) return this.view
    const contents = this.pendingContents
    this.pendingContents = null
    const view = contents
      ? new WebContentsView({ webContents: contents })
      : new WebContentsView({
          webPreferences: {
            session: this.host.session,
            preload: PRELOAD,
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            spellcheck: true,
            safeDialogs: true,
            // Heavy Mode: background tabs run at full speed.
            backgroundThrottling: !getSettings().performance.heavy
          }
        })
    view.setBorderRadius(0)
    view.setBackgroundColor(this.url.startsWith('ovyra:') ? '#0d0b14' : '#ffffff')
    this.view = view
    this.attach(view.webContents)
    view.webContents.setAudioMuted(this.muted)

    if (!contents) {
      if (this.saved) {
        const { entries, index } = this.saved
        this.saved = null
        view.webContents.navigationHistory.restore({ entries, index }).catch(() => this.load(this.url))
      } else {
        this.load(this.url)
      }
    }
    return view
  }

  /** Unloads the page to free memory, keeping its back/forward history. */
  sleep(): void {
    const wc = this.wc
    if (!wc) return
    this.saved = this.navigationSnapshot()
    this.closingOnPurpose = true
    this.view = null
    this.loading = false
    this.audible = false
    if (!wc.isDestroyed()) wc.close()
    this.closingOnPurpose = false
  }

  destroy(): void {
    this.closingOnPurpose = true
    const wc = this.wc
    this.view = null
    if (wc && !wc.isDestroyed()) wc.close()
  }

  load(url: string): void {
    this.url = url
    this.failedUrl = null
    const wc = this.wc
    if (!wc) return
    wc.loadURL(url).catch(() => {
      /* failures are reported through did-fail-load */
    })
  }

  reload(ignoreCache = false): void {
    const wc = this.wc
    if (!wc) return
    if (this.failedUrl) return this.load(this.failedUrl)
    if (ignoreCache) wc.reloadIgnoringCache()
    else wc.reload()
  }

  recordBlocked(url: string): void {
    this.blocked++
    let host = url
    try {
      host = new URL(url).hostname.replace(/^www\./, '')
    } catch {
      /* keep the raw URL */
    }
    this.blockedHosts.set(host, (this.blockedHosts.get(host) ?? 0) + 1)
    this.host.tabChanged(this)
  }

  setBoost(value: number): void {
    this.boost = Math.min(Math.max(value, 1), 4)
    this.sendBoost()
    this.host.tabChanged(this)
  }

  private sendBoost(): void {
    const wc = this.wc
    if (!wc || wc.isDestroyed()) return
    for (const frame of wc.mainFrame.framesInSubtree) {
      try {
        frame.send('ovyra:boost', this.boost)
      } catch {
        /* frame went away */
      }
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    this.wc?.setAudioMuted(muted)
    this.host.tabChanged(this)
  }

  displayUrl(): string {
    if (this.isNewTab) return ''
    if (this.url.startsWith(ERROR_PAGE)) return this.failedUrl ?? new URL(this.url).searchParams.get('u') ?? ''
    return this.url
  }

  /** The real page URL (not the error page) — what bookmarks and history refer to. */
  pageUrl(): string {
    return this.url.startsWith(ERROR_PAGE) ? this.displayUrl() : this.url
  }

  security(): Security {
    const url = this.displayUrl()
    if (url.startsWith('ovyra:') || !url) return 'internal'
    if (url.startsWith('https:')) return 'secure'
    if (url.startsWith('http:')) {
      const host = new URL(url).hostname
      return host === 'localhost' || host === '127.0.0.1' ? 'none' : 'insecure'
    }
    return 'none'
  }

  state(): TabState {
    const wc = this.wc
    const nav = wc?.navigationHistory
    return {
      id: this.id,
      url: this.url,
      displayUrl: this.displayUrl(),
      title: this.title || this.fallbackTitle(),
      favicon: this.favicon,
      loading: this.loading,
      canGoBack: nav ? nav.canGoBack() : !!this.saved && this.saved.index > 0,
      canGoForward: nav ? nav.canGoForward() : !!this.saved && this.saved.index < this.saved.entries.length - 1,
      audible: this.audible,
      muted: this.muted,
      pinned: this.pinned,
      sleeping: this.sleeping,
      floating: isFloating(this),
      boost: this.boost,
      zoom: wc && !wc.isDestroyed() ? wc.getZoomFactor() : 1,
      security: this.security(),
      bookmarked: isBookmarked(this.pageUrl()),
      blocked: this.blocked,
      shields: shieldsEnabled(this.pageUrl()),
      workspaceId: this.workspaceId,
      islandId: this.islandId
    }
  }

  snapshot(): TabSnapshot {
    const nav = this.wc ? this.navigationSnapshot() : this.saved
    return {
      url: this.pageUrl(),
      title: this.title,
      favicon: this.favicon,
      pinned: this.pinned,
      workspaceId: this.workspaceId,
      islandId: this.islandId,
      ...(nav ?? {})
    }
  }

  private navigationSnapshot(): { entries: NavigationEntry[]; index: number } | null {
    const nav = this.wc?.navigationHistory
    if (!nav) return this.saved
    let entries = nav.getAllEntries()
    let index = nav.getActiveIndex()
    if (!entries.length) return null
    if (entries.length > MAX_ENTRIES) {
      const cut = entries.length - MAX_ENTRIES
      entries = entries.slice(cut)
      index = Math.max(0, index - cut)
    }
    // Error pages are rebuilt on load; restoring them would show a stale error.
    entries = entries.map((e) =>
      e.url.startsWith(ERROR_PAGE) ? { url: new URL(e.url).searchParams.get('u') ?? NEW_TAB_URL, title: e.title } : e
    )
    return { entries, index }
  }

  private fallbackTitle(): string {
    if (this.isNewTab) return 'New Tab'
    const url = this.displayUrl()
    try {
      const u = new URL(url)
      if (u.protocol === 'ovyra:') return u.host.charAt(0).toUpperCase() + u.host.slice(1)
      return u.host || url
    } catch {
      return url
    }
  }

  private showError(url: string, code: number | string, description: string): void {
    this.failedUrl = url
    const qs = new URLSearchParams({ u: url, c: String(code), d: description })
    this.wc?.loadURL(`${ERROR_PAGE}?${qs}`).catch(() => {})
  }

  private attach(wc: WebContents): void {
    const changed = (): void => this.host.tabChanged(this)
    // Private windows leave no history behind.
    const record = this.host.incognito ? null : history
    tabsByContents.set(wc.id, this)
    trackTab(wc, this.host.win, this.host.incognito)
    wc.on('focus', () => this.host.tabFocused(this))
    // A boosted tab keeps its boost on new pages and in new frames.
    wc.on('did-frame-finish-load', () => this.boost !== 1 && this.sendBoost())

    wc.on('did-start-navigation', (details) => {
      // A new page starts with a fresh blocked count.
      if (details.isMainFrame && !details.isSameDocument) {
        this.blocked = 0
        this.blockedHosts.clear()
      }
    })
    wc.on('did-start-loading', () => {
      this.loading = true
      changed()
    })
    wc.on('did-stop-loading', () => {
      this.loading = false
      changed()
    })
    wc.on('did-navigate', (_e, url) => {
      const wasError = url.startsWith(ERROR_PAGE)
      if (!wasError) this.failedUrl = null
      if (url !== this.url) this.favicon = history.faviconFor(url)
      // A new page starts with its own title; pages without a <title> (images, videos) never send one.
      this.title = wc.getTitle()
      this.url = url
      navigationCommitted(url)
      if (!wasError) record?.addVisit(url, wc.getTitle(), this.favicon)
      changed()
    })
    wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
      if (!isMainFrame) return
      this.url = url
      record?.addVisit(url, wc.getTitle(), this.favicon)
      changed()
    })
    wc.on('page-title-updated', (_e, title) => {
      this.title = title
      record?.updatePage(this.url, { title })
      changed()
    })
    wc.on('page-favicon-updated', (_e, favicons) => {
      this.favicon = favicons[0] ?? null
      record?.updatePage(this.url, { favicon: this.favicon })
      changed()
    })
    wc.on('audio-state-changed', (e) => {
      this.audible = e.audible
      changed()
    })
    wc.on('did-fail-load', (_e, code, description, validatedUrl, isMainFrame) => {
      // -3 is ERR_ABORTED: the user navigated away or stopped the load.
      if (!isMainFrame || code === -3 || validatedUrl.startsWith(ERROR_PAGE)) return
      // The site has no working HTTPS after all: go back to the http:// address.
      const fallback = httpsFallback(validatedUrl, code)
      if (fallback) return this.load(fallback)
      this.showError(validatedUrl, code, description)
    })
    wc.on('render-process-gone', (_e, details) => {
      if (details.reason === 'clean-exit') return
      const url = this.pageUrl()
      setImmediate(() => this.showError(url, 'crashed', details.reason))
    })
    wc.on('zoom-changed', (_e, direction) => {
      stepZoom(wc, direction === 'in' ? 1 : -1)
      changed()
    })
    wc.on('found-in-page', (_e, result) => this.host.foundInPage(this, result))
    wc.on('enter-html-full-screen', () => this.host.htmlFullscreen(this, true))
    wc.on('leave-html-full-screen', () => this.host.htmlFullscreen(this, false))
    wc.on('context-menu', (_e, params) => this.host.contextMenu(this, params))
    wc.on('before-input-event', (e, input) => {
      if (this.host.handleKey(input)) e.preventDefault()
    })
    const id = wc.id
    wc.on('destroyed', () => {
      if (tabsByContents.get(id) === this) tabsByContents.delete(id)
      if (!this.closingOnPurpose && this.wc === wc) this.host.tabClosedItself(this)
    })

    // Web pages may not navigate to (or embed) the browser's own pages.
    wc.on('will-frame-navigate', (e) => {
      if (isInternalUrl(e.url) && !isInternalUrl(wc.getURL()) && wc.getURL() !== '') e.preventDefault()
    })

    wc.setWindowOpenHandler((details) => {
      if (isInternalUrl(details.url) && !isInternalUrl(wc.getURL())) return { action: 'deny' }
      // Script popups with window features (OAuth sign-in, payment) stay real popups.
      if (details.disposition === 'new-window') {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: { autoHideMenuBar: true, backgroundColor: '#ffffff' }
        }
      }
      return {
        action: 'allow',
        outlivesOpener: true,
        createWindow: (options: BrowserWindowConstructorOptions & { webContents?: WebContents }) => {
          const contents = options.webContents!
          this.host.openFromTab(this, {
            foreground: details.disposition !== 'background-tab',
            webContents: contents,
            url: details.url
          })
          return contents
        }
      }
    })
  }
}

export const ZOOM_LEVELS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5]

export function stepZoom(wc: WebContents, dir: 1 | -1 | 0): void {
  if (dir === 0) return wc.setZoomFactor(1)
  const cur = wc.getZoomFactor()
  const next =
    dir > 0 ? ZOOM_LEVELS.find((z) => z > cur + 0.001) : [...ZOOM_LEVELS].reverse().find((z) => z < cur - 0.001)
  if (next) wc.setZoomFactor(next)
}
