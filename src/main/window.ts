import { BrowserWindow, nativeTheme, WebContentsView, screen, session, type Rectangle, type WebContents } from 'electron'
import { join } from 'node:path'
import {
  BASE_DARK,
  BASE_LIGHT,
  ISLAND_COLORS,
  NEW_TAB_URL,
  type IslandState,
  type FindState,
  type MenuModel,
  type InternalPage,
  type OverlayPayload,
  type Rect,
  type ShellCommand,
  type WindowState
} from '@shared/types'
import { toggleBookmark } from './bookmarks'
import { markTyped } from './history'
import { pageContextMenu } from './menus'
import { looksLikeUrl, resolveInput } from './omnibox'
import { isFrozen, resumeSessionSaving, saveSessionNow, scheduleSessionSave } from './sessionstore'
import { endPrivateBrowsing, getPrivateSession } from './sessions'
import { getSettings, updateSettings } from './settings'
import { devtoolsCss } from './devtools'
import { selectTab as selectExtensionTab } from './extensions'
import { panelStates, panelView, releasePanels } from './panels'
import { PRELOAD, stepZoom, Tab, type TabHost, type TabSnapshot } from './tab'

export const TAB_STRIP_HEIGHT = 40
const MAX_CLOSED = 25
const SPLIT_GAP = 8

export interface WindowSnapshot {
  bounds: Rectangle
  maximized: boolean
  tabs: TabSnapshot[]
  active: number
  workspaceId?: string
  islands?: IslandState[]
}

/** Private windows don't use workspaces; all their tabs live here. */
const PRIVATE_WORKSPACE = 'private'
let nextIslandId = 1

type ClosedTab = TabSnapshot & { index: number }
const closedTabs: ClosedTab[] = []

export class BrowserWin implements TabHost {
  static all = new Set<BrowserWin>()
  static lastFocused: BrowserWin | null = null

  readonly win: BrowserWindow
  readonly overlay: WebContentsView
  readonly incognito: boolean
  readonly session: Electron.Session
  tabs: Tab[] = []
  /** Private windows keep their closed tabs to themselves. */
  private readonly closed: ClosedTab[]
  activeId: number | null = null
  workspaceId: string
  /** The last tab used in each workspace, to return to when switching back. */
  private readonly lastActiveIn = new Map<string, number>()
  readonly islands = new Map<number, { color: string; collapsed: boolean }>()
  panelId: string | null = null

  /** Two tabs shown side by side, when split view is on. */
  split: [number, number] | null = null
  /** Tabs whose pages are attached to the window right now. */
  private shown: Tab[] = []
  private contentRect: Rect = { x: 0, y: 0, width: 0, height: 0 }
  private panelRect: Rect = { x: 0, y: 0, width: 0, height: 0 }
  private devtoolsRect: Rect = { x: 0, y: 0, width: 0, height: 0 }
  /** The DevTools view on screen (it belongs to the active tab). */
  private devtoolsShown: WebContentsView | null = null
  private find: FindState = { open: false, query: '', active: 0, matches: 0 }
  private overlayShown = false
  private htmlFullscreenTab: Tab | null = null
  private pushQueued = false

  static open(init?: Partial<WindowSnapshot> & { incognito?: boolean }): BrowserWin {
    return new BrowserWin(init)
  }

  static fromWebContents(wc: WebContents): BrowserWin | undefined {
    for (const w of BrowserWin.all) {
      if (w.win.webContents === wc || w.overlay.webContents === wc) return w
      if (w.tabs.some((t) => t.wc === wc)) return w
    }
    return undefined
  }

  static focused(): BrowserWin | undefined {
    return BrowserWin.lastFocused ?? [...BrowserWin.all][0]
  }

  private constructor(init?: Partial<WindowSnapshot> & { incognito?: boolean }) {
    BrowserWin.all.add(this)
    BrowserWin.lastFocused = this
    this.incognito = !!init?.incognito
    this.session = this.incognito ? getPrivateSession() : session.defaultSession
    this.closed = this.incognito ? [] : closedTabs
    if (!this.incognito) resumeSessionSaving()
    const workspaces = getSettings().workspaces
    this.workspaceId = this.incognito
      ? PRIVATE_WORKSPACE
      : workspaces.find((w) => w.id === init?.workspaceId)?.id ?? workspaces[0].id
    for (const island of init?.islands ?? []) {
      this.islands.set(island.id, { color: island.color, collapsed: island.collapsed })
      nextIslandId = Math.max(nextIslandId, island.id + 1)
    }

    this.win = new BrowserWindow({
      ...windowBounds(init?.bounds),
      minWidth: 520,
      minHeight: 360,
      show: false,
      title: 'Ovyra',
      icon: join(__dirname, '../../resources/icon.png'),
      titleBarStyle: 'hidden',
      titleBarOverlay: titleBarColors(),
      backgroundColor: nativeTheme.shouldUseDarkColors ? BASE_DARK : BASE_LIGHT,
      webPreferences: { preload: PRELOAD, sandbox: true, contextIsolation: true, spellcheck: true }
    })
    if (init?.maximized) this.win.maximize()
    this.win.loadURL('ovyra://shell/')
    // With a transparent Mica window `ready-to-show` doesn't always fire; show on whichever comes first.
    const show = (): void => {
      if (!this.win.isDestroyed() && !this.win.isVisible()) this.win.show()
    }
    this.win.once('ready-to-show', show)
    this.win.webContents.once('did-finish-load', () => setTimeout(show, 30))

    this.overlay = new WebContentsView({
      webPreferences: { preload: PRELOAD, sandbox: true, contextIsolation: true }
    })
    this.overlay.setBackgroundColor('#00000000')
    this.overlay.webContents.loadURL('ovyra://overlay/')
    this.overlay.webContents.on('before-input-event', (e, input) => {
      if (this.handleKey(input)) e.preventDefault()
    })

    const shell = this.win.webContents
    shell.on('before-input-event', (e, input) => {
      if (this.handleKey(input)) e.preventDefault()
    })
    // A link or URL dropped on the browser UI opens in a new tab instead of replacing the UI.
    shell.on('will-navigate', (e) => {
      e.preventDefault()
      if (/^https?:/.test(e.url)) this.newTab(e.url)
    })
    shell.setWindowOpenHandler(() => ({ action: 'deny' }))

    this.win.on('focus', () => (BrowserWin.lastFocused = this))
    this.win.on('enter-full-screen', () => this.relayout())
    this.win.on('leave-full-screen', () => {
      if (this.htmlFullscreenTab?.wc && !this.htmlFullscreenTab.wc.isDestroyed()) {
        this.htmlFullscreenTab.wc.executeJavaScript('document.fullscreenElement && document.exitFullscreen()').catch(() => {})
      }
      this.htmlFullscreenTab = null
      this.relayout()
    })
    this.win.on('maximize', () => this.relayout())
    this.win.on('unmaximize', () => this.relayout())
    this.win.on('resize', () => scheduleSessionSave())
    this.win.on('move', () => scheduleSessionSave())
    this.win.on('app-command', (_e, cmd) => {
      if (cmd === 'browser-backward') this.active?.wc?.navigationHistory.goBack()
      if (cmd === 'browser-forward') this.active?.wc?.navigationHistory.goForward()
    })
    this.win.on('close', () => {
      // The last normal window's tabs are what gets restored next launch. Private
      // windows are never saved, so closing one can't touch the saved session.
      const othersNormal = [...BrowserWin.all].some((w) => w !== this && !w.incognito)
      if (!this.incognito && !othersNormal && !isFrozen()) saveSessionNow(true)
    })
    this.win.on('closed', () => {
      releasePanels(this)
      for (const t of this.tabs) t.destroy()
      if (!this.overlay.webContents.isDestroyed()) this.overlay.webContents.close()
      this.tabs = []
      BrowserWin.all.delete(this)
      if (BrowserWin.lastFocused === this) BrowserWin.lastFocused = [...BrowserWin.all][0] ?? null
      if (this.incognito && ![...BrowserWin.all].some((w) => w.incognito)) void endPrivateBrowsing()
      scheduleSessionSave()
    })

    if (init?.tabs?.length) {
      const known = new Set(workspaces.map((w) => w.id))
      this.tabs = init.tabs.map((s) => {
        const tab = new Tab(this, s)
        // A tab whose workspace was deleted moves to the first one.
        if (this.incognito) tab.workspaceId = PRIVATE_WORKSPACE
        else if (!known.has(tab.workspaceId)) tab.workspaceId = workspaces[0].id
        if (tab.islandId !== null && !this.islands.has(tab.islandId)) tab.islandId = null
        return tab
      })
      this.normalizeIslands()
      this.activate(this.tabs[Math.min(Math.max(init.active ?? 0, 0), this.tabs.length - 1)])
    } else {
      this.newTab()
    }
  }

  get active(): Tab | undefined {
    return this.tabs.find((t) => t.id === this.activeId)
  }

  get defaultWorkspace(): string {
    return this.workspaceId
  }

  /** Tabs of the current workspace, in order — what the tab strip shows. */
  visible(): Tab[] {
    return this.tabs.filter((t) => t.workspaceId === this.workspaceId)
  }

  // ---- workspaces -------------------------------------------------------------------

  switchWorkspace(id: string): void {
    if (id === this.workspaceId || this.incognito) return
    if (!getSettings().workspaces.some((w) => w.id === id)) return
    this.workspaceId = id
    const remembered = this.tab(this.lastActiveIn.get(id) ?? -1)
    const target = remembered?.workspaceId === id ? remembered : this.visible().at(-1)
    if (target) this.activate(target)
    else this.newTab()
    this.contextChanged()
  }

  moveToWorkspace(tab: Tab, id: string): void {
    if (tab.workspaceId === id) return
    const wasActive = tab === this.active
    tab.workspaceId = id
    tab.islandId = null
    this.tabs.splice(this.tabs.indexOf(tab), 1)
    this.tabs.push(tab)
    this.normalizeIslands()
    if (wasActive) {
      const next = this.visible().at(-1)
      this.activeId = null
      if (next) this.activate(next)
      else this.newTab()
    } else this.changed()
  }

  /** A workspace was deleted: its tabs go with it. */
  workspaceRemoved(id: string, fallback: string): void {
    for (const t of this.tabs.filter((t) => t.workspaceId === id)) {
      if (t.view) this.win.contentView.removeChildView(t.view)
      t.destroy()
      this.tabs.splice(this.tabs.indexOf(t), 1)
    }
    if (this.workspaceId === id) {
      this.workspaceId = fallback
      this.activeId = null
      const next = this.visible().at(-1)
      if (next) this.activate(next)
      else this.newTab()
      this.contextChanged()
    } else this.changed()
  }

  /** Tells this window's pages which workspace (and so which theme) they're in. */
  contextChanged(): void {
    const context = { private: this.incognito, workspaceId: this.workspaceId }
    this.send('context', context)
    if (!this.overlay.webContents.isDestroyed()) this.overlay.webContents.send('context', context)
    for (const t of this.tabs) if (t.wc && t.url.startsWith('ovyra:')) t.wc.send('context', context)
    this.changed()
  }

  // ---- tab islands ------------------------------------------------------------------
  // Tabs opened from the same page are grouped, like Opera's tab islands.

  private joinIsland(child: Tab, opener: Tab): void {
    if (!getSettings().tabIslands || opener.pinned || opener.workspaceId !== child.workspaceId) return
    let id = opener.islandId
    if (id === null) {
      id = nextIslandId++
      const used = new Set([...this.islands.values()].map((i) => i.color))
      const color = ISLAND_COLORS.find((c) => !used.has(c)) ?? ISLAND_COLORS[id % ISLAND_COLORS.length]
      this.islands.set(id, { color, collapsed: false })
      opener.islandId = id
    }
    child.islandId = id
  }

  toggleIsland(id: number): void {
    const island = this.islands.get(id)
    if (!island) return
    island.collapsed = !island.collapsed
    this.changed()
  }

  leaveIsland(tab: Tab): void {
    tab.islandId = null
    this.normalizeIslands()
    this.changed()
  }

  closeIsland(id: number): void {
    for (const t of this.tabs.filter((t) => t.islandId === id)) this.closeTab(t)
  }

  /** Islands must be one unbroken run of 2+ tabs; anything else falls apart. */
  private normalizeIslands(): void {
    const count = new Map<number, number>()
    const workspaceIds = new Set(this.tabs.map((t) => t.workspaceId))
    for (const ws of workspaceIds) {
      const list = this.tabs.filter((t) => t.workspaceId === ws)
      const finished = new Set<number>()
      let current: number | null = null
      for (const t of list) {
        if (t.pinned) t.islandId = null
        if (t.islandId !== current && current !== null) finished.add(current)
        if (t.islandId !== null && finished.has(t.islandId)) t.islandId = null
        current = t.islandId
        if (t.islandId !== null) count.set(t.islandId, (count.get(t.islandId) ?? 0) + 1)
      }
    }
    for (const t of this.tabs) if (t.islandId !== null && (count.get(t.islandId) ?? 0) < 2) t.islandId = null
    for (const id of [...this.islands.keys()]) if (!this.tabs.some((t) => t.islandId === id)) this.islands.delete(id)
  }

  // ---- side panel -------------------------------------------------------------------

  setPanelRect(rect: Rect): void {
    this.panelRect = rect
    this.layout()
  }

  tab(id: number): Tab | undefined {
    return this.tabs.find((t) => t.id === id)
  }

  // ---- tabs -------------------------------------------------------------------------

  newTab(url: string = NEW_TAB_URL, opts: { foreground?: boolean; opener?: Tab; index?: number } = {}): Tab {
    const tab = new Tab(this, { url, workspaceId: opts.opener?.workspaceId })
    if (opts.opener && url !== NEW_TAB_URL) this.joinIsland(tab, opts.opener)
    this.insert(tab, opts.opener, opts.index)
    if (opts.foreground ?? true) this.activate(tab)
    else {
      // Background tabs start loading right away; only restored tabs wait to be clicked.
      tab.wake()
      this.changed()
    }
    return tab
  }

  openFromTab(opener: Tab, opts: { foreground: boolean; webContents: WebContents; url: string }): void {
    const tab = new Tab(this, { url: opts.url, webContents: opts.webContents, workspaceId: opener.workspaceId })
    tab.wake()
    this.joinIsland(tab, opener)
    this.insert(tab, opener)
    if (opts.foreground) this.activate(tab)
    else this.changed()
  }

  private insert(tab: Tab, opener?: Tab, index?: number): void {
    if (index !== undefined) {
      // `index` counts tabs of the current workspace (what the strip shows).
      const vis = this.visible()
      const at = index < vis.length ? this.tabs.indexOf(vis[index]) : this.tabs.length
      this.tabs.splice(Math.max(at, this.firstUnpinned()), 0, tab)
      return
    }
    if (opener) {
      // Tabs opened from a page line up to its right (inside its island), in the order opened.
      tab.openerId = opener.id
      let at = this.tabs.indexOf(opener) + 1
      while (
        at < this.tabs.length &&
        (this.tabs[at].openerId === opener.id || (opener.islandId !== null && this.tabs[at].islandId === opener.islandId))
      )
        at++
      this.tabs.splice(Math.max(at, this.firstUnpinned()), 0, tab)
      return
    }
    this.tabs.push(tab)
  }

  private firstUnpinned(): number {
    const i = this.tabs.findIndex((t) => !t.pinned)
    return i === -1 ? this.tabs.length : i
  }

  activate(tab: Tab): void {
    const prev = this.active
    if (prev && prev !== tab) {
      prev.lastActive = Date.now()
      if (this.find.open) this.closeFind()
    }
    this.activeId = tab.id
    tab.lastActive = Date.now()
    if (tab.workspaceId !== this.workspaceId) {
      this.workspaceId = tab.workspaceId
      this.contextChanged()
    }
    this.lastActiveIn.set(tab.workspaceId, tab.id)
    // Switching to a tab inside a collapsed island opens the island.
    const island = tab.islandId !== null ? this.islands.get(tab.islandId) : undefined
    if (island) island.collapsed = false
    this.show(this.split?.includes(tab.id) ? this.splitTabs() : [tab])
    this.showDevTools()
    selectExtensionTab(tab.wc, this.incognito)
    this.layout()
    if (tab.isNewTab) {
      this.focusOmnibox()
      // A freshly loaded page takes keyboard focus; hand it back to the address bar.
      if (tab.wc?.isLoading()) {
        tab.wc.once('did-finish-load', () => {
          if (this.activeId === tab.id && tab.isNewTab && this.win.isFocused()) this.focusOmnibox()
        })
      }
    } else if (this.win.isFocused()) tab.wc?.focus()
    this.changed()
  }

  cycle(step: number): void {
    const vis = this.visible()
    if (vis.length < 2 || !this.active) return
    const i = vis.indexOf(this.active)
    this.activate(vis[(i + step + vis.length) % vis.length])
  }

  closeTab(tab: Tab): void {
    const index = this.tabs.indexOf(tab)
    if (index === -1) return
    if (!tab.isNewTab) {
      this.closed.push({ ...tab.snapshot(), index })
      if (this.closed.length > MAX_CLOSED) this.closed.shift()
    }
    this.removeTab(tab)
  }

  tabClosedItself(tab: Tab): void {
    this.removeTab(tab)
  }

  private removeTab(tab: Tab): void {
    const index = this.tabs.indexOf(tab)
    if (index === -1) return
    const visIndex = this.visible().indexOf(tab)
    this.closeDevTools(tab)
    if (tab.view) this.win.contentView.removeChildView(tab.view)
    this.shown = this.shown.filter((t) => t !== tab)
    if (this.split?.includes(tab.id)) this.split = null
    tab.destroy()
    this.tabs.splice(index, 1)
    this.normalizeIslands()
    if (!this.tabs.length) {
      this.win.close()
      return
    }
    if (this.activeId === tab.id) {
      // Prefer going back to the tab that opened this one, like Chrome.
      const opener = tab.openerId !== null ? this.tab(tab.openerId) : undefined
      const vis = this.visible()
      this.activeId = null
      if (opener && opener.workspaceId === this.workspaceId) this.activate(opener)
      else if (vis.length) this.activate(vis[Math.min(visIndex, vis.length - 1)])
      // The workspace's last tab closed, but others still have tabs: keep this one open.
      else this.newTab()
    } else {
      this.changed()
    }
  }

  closeOthers(keep: Tab): void {
    for (const t of this.visible()) if (t !== keep && !t.pinned) this.closeTab(t)
  }

  closeToRight(of: Tab): void {
    const vis = this.visible()
    for (const t of vis.slice(vis.indexOf(of) + 1)) if (!t.pinned) this.closeTab(t)
  }

  reopenClosed(): void {
    const snap = this.closed.pop()
    if (!snap) return
    const tab = new Tab(this, snap)
    this.tabs.splice(Math.min(Math.max(snap.index, snap.pinned ? 0 : this.firstUnpinned()), this.tabs.length), 0, tab)
    this.activate(tab)
  }

  hasClosedTabs(): boolean {
    return this.closed.length > 0
  }

  duplicate(tab: Tab): void {
    const copy = new Tab(this, { ...tab.snapshot(), pinned: false })
    this.insert(copy, tab)
    this.activate(copy)
  }

  /** Moves a tab to position `to` among the visible tabs (what the strip shows). */
  moveTab(id: number, to: number): void {
    const tab = this.tab(id)
    if (!tab) return
    const vis = this.visible()
    if (vis.indexOf(tab) === to) return
    this.tabs.splice(this.tabs.indexOf(tab), 1)
    const rest = vis.filter((t) => t !== tab)
    const pinned = rest.filter((t) => t.pinned).length
    const slot = tab.pinned ? Math.min(to, pinned) : Math.max(to, pinned)
    const at = slot < rest.length ? this.tabs.indexOf(rest[slot]) : this.tabs.indexOf(rest[rest.length - 1]) + 1
    this.tabs.splice(at, 0, tab)

    // Dropping a tab between two tabs of an island makes it part of that island;
    // dragging it away from its island takes it out.
    const left = rest[slot - 1]
    const right = rest[slot]
    if (left?.islandId != null && left.islandId === right?.islandId) tab.islandId = left.islandId
    else if (tab.islandId !== null && left?.islandId !== tab.islandId && right?.islandId !== tab.islandId) tab.islandId = null
    this.normalizeIslands()
    this.changed()
  }

  setPinned(tab: Tab, pinned: boolean): void {
    if (tab.pinned === pinned) return
    this.tabs.splice(this.tabs.indexOf(tab), 1)
    tab.pinned = pinned
    // Pinning moves to the end of the pinned group; unpinning to the start of the rest.
    const at = this.tabs.filter((t) => t.pinned).length
    this.tabs.splice(at, 0, tab)
    this.normalizeIslands()
    this.changed()
  }

  sleepTab(tab: Tab): void {
    if (tab === this.active || tab.sleeping) return
    this.closeDevTools(tab)
    tab.sleep()
    this.changed()
  }

  /** Puts idle background tabs to sleep. Audible, pinned and DevTools-inspected tabs stay awake. */
  sleepIdleTabs(maxIdleMs: number): void {
    const now = Date.now()
    for (const t of this.tabs) {
      if (t === this.active || this.shown.includes(t) || t.sleeping || t.pinned || t.audible) continue
      if (t.wc?.isDevToolsOpened() || t.wc?.isCurrentlyAudible()) continue
      if (now - t.lastActive > maxIdleMs) t.sleep()
    }
    this.changed()
  }

  // ---- navigation -----------------------------------------------------------------

  navigate(input: string, opts: { newTab?: boolean; background?: boolean } = {}): void {
    const url = resolveInput(input)
    if (!url) return
    if (looksLikeUrl(input)) markTyped(url)
    if (opts.newTab || !this.active) {
      this.newTab(url, { foreground: !opts.background, opener: this.active })
      return
    }
    const tab = this.active
    tab.wake()
    tab.load(url)
    tab.wc?.focus()
    this.changed()
  }

  openInternal(page: InternalPage): void {
    const prefix = `ovyra://${page}/`
    const existing = this.visible().find((t) => t.url.startsWith(prefix))
    if (existing) return this.activate(existing)
    const tab = this.active
    if (tab?.isNewTab) {
      tab.load(prefix)
      tab.wc?.focus()
      this.changed()
    } else {
      this.newTab(prefix)
    }
  }

  toggleBookmarkActive(): void {
    const tab = this.active
    if (!tab || tab.security() === 'internal') return
    toggleBookmark(tab.pageUrl(), tab.title, tab.favicon)
  }

  // ---- find in page --------------------------------------------------------------

  openFind(): void {
    this.find.open = true
    this.send('command', 'open-find' satisfies ShellCommand)
    this.win.webContents.focus()
    this.changed()
  }

  findQuery(text: string, forward = true, findNext = false): void {
    const wc = this.active?.wc
    this.find.query = text
    if (!wc) return
    if (!text) {
      wc.stopFindInPage('clearSelection')
      this.find.matches = 0
      this.find.active = 0
      this.changed()
      return
    }
    wc.findInPage(text, { forward, findNext })
  }

  closeFind(): void {
    this.active?.wc?.stopFindInPage('keepSelection')
    this.find = { open: false, query: this.find.query, active: 0, matches: 0 }
    this.changed()
  }

  foundInPage(tab: Tab, result: Electron.Result): void {
    if (tab !== this.active) return
    this.find.matches = result.matches
    this.find.active = result.activeMatchOrdinal
    this.changed()
  }

  // ---- layout, overlay, fullscreen ----------------------------------------------

  setContentRect(rect: Rect): void {
    this.contentRect = rect
    this.layout()
  }

  relayout(): void {
    this.layout()
    this.changed()
  }

  layout(): void {
    const fullscreen = this.win.isFullScreen()
    const panel = panelView(this.panelId)
    if (panel) panel.setBounds(fullscreen ? { x: 0, y: 0, width: 0, height: 0 } : roundRect(this.panelRect))
    if (this.devtoolsShown) {
      this.devtoolsShown.setBounds(fullscreen ? { x: 0, y: 0, width: 0, height: 0 } : roundRect(this.devtoolsRect))
    }
    const view = this.active?.view
    if (!view) return
    // Fullscreen (F11 or a video) gives the whole screen to the page, like Chrome.
    if (fullscreen) {
      const [width, height] = this.win.getContentSize()
      for (const t of this.shown) if (t.view && t !== this.active) t.view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
      view.setBorderRadius(0)
      view.setBounds({ x: 0, y: 0, width, height })
      return
    }
    const pair = this.shown.length === 2 ? this.splitTabs() : null
    if (!pair) {
      view.setBorderRadius(8)
      view.setBounds(roundRect(this.contentRect))
      return
    }
    // Split view: two pages side by side, each inset so the shell can outline the focused one.
    const r = this.contentRect
    const gap = SPLIT_GAP
    const half = (r.width - gap) / 2
    pair.forEach((t, i) => {
      t.view?.setBorderRadius(7)
      t.view?.setBounds(
        roundRect({ x: r.x + i * (half + gap) + 2, y: r.y + 2, width: half - 4, height: r.height - 4 })
      )
    })
  }

  // ---- DevTools, docked in the window --------------------------------------------------

  setDevtoolsRect(rect: Rect): void {
    this.devtoolsRect = rect
    this.layout()
  }

  openDevTools(tab: Tab): void {
    const wc = tab.wc
    if (!wc) return
    if (!tab.devtools) {
      const view = new WebContentsView()
      view.setBorderRadius(8)
      view.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#0c121d' : '#f3f4f8')
      tab.devtools = view
      wc.setDevToolsWebContents(view.webContents)
      wc.openDevTools({ mode: 'detach', activate: false })
      view.webContents.on('dom-ready', () => void view.webContents.insertCSS(devtoolsCss()).catch(() => {}))
      wc.once('devtools-closed', () => this.closeDevTools(tab))
    }
    this.showDevTools()
    tab.devtools.webContents.focus()
    this.changed()
  }

  closeDevTools(tab: Tab): void {
    const view = tab.devtools
    if (!view) return
    tab.devtools = null
    if (tab.wc && !tab.wc.isDestroyed() && tab.wc.isDevToolsOpened()) tab.wc.closeDevTools()
    if (this.devtoolsShown === view) {
      this.win.contentView.removeChildView(view)
      this.devtoolsShown = null
    }
    if (!view.webContents.isDestroyed()) view.webContents.close()
    this.relayout()
  }

  toggleDevTools(tab: Tab): void {
    if (tab.devtools) this.closeDevTools(tab)
    else this.openDevTools(tab)
  }

  /** Each tab keeps its own DevTools; show the active tab's (if it has one open). */
  private showDevTools(): void {
    const want = this.active?.devtools ?? null
    if (this.devtoolsShown && this.devtoolsShown !== want) this.win.contentView.removeChildView(this.devtoolsShown)
    if (want) this.win.contentView.addChildView(want)
    this.devtoolsShown = want
    if (this.overlayShown) this.win.contentView.addChildView(this.overlay)
    this.layout()
  }

  // ---- split view -------------------------------------------------------------------

  private splitTabs(): Tab[] {
    return (this.split ?? []).map((id) => this.tab(id)).filter((t): t is Tab => !!t)
  }

  /** Puts exactly these tabs' pages on screen. */
  private show(tabs: Tab[]): void {
    for (const t of this.shown) if (!tabs.includes(t) && t.view) this.win.contentView.removeChildView(t.view)
    for (const t of tabs) this.win.contentView.addChildView(t.wake())
    this.shown = tabs
    if (this.overlayShown) this.win.contentView.addChildView(this.overlay)
  }

  /** Shows a tab side by side with another (by default the next tab, or a new one). */
  splitWith(tab: Tab, other?: Tab): void {
    const vis = this.visible()
    const partner =
      other ?? vis[vis.indexOf(tab) + 1] ?? vis[vis.indexOf(tab) - 1] ?? this.newTab(NEW_TAB_URL, { foreground: false })
    if (partner === tab) return
    if (partner.workspaceId !== tab.workspaceId) this.moveToWorkspace(partner, tab.workspaceId)
    this.split = [tab.id, partner.id]
    this.activate(tab)
  }

  unsplit(): void {
    this.split = null
    const tab = this.active
    if (tab) this.activate(tab)
  }

  /** In split view, clicking into a page makes it the active tab (address bar, shortcuts). */
  tabFocused(tab: Tab): void {
    if (tab.id === this.activeId || !this.split?.includes(tab.id)) return
    this.activeId = tab.id
    this.lastActiveIn.set(tab.workspaceId, tab.id)
    selectExtensionTab(tab.wc, this.incognito)
    this.changed()
  }

  openPalette(): void {
    const r = this.contentRect
    const width = Math.min(680, r.width - 40)
    this.showOverlay({ x: r.x + (r.width - width) / 2 - 14, y: r.y + 10, width: width + 28, height: 480 }, { kind: 'palette' }, true)
  }

  htmlFullscreen(tab: Tab, on: boolean): void {
    this.htmlFullscreenTab = on ? tab : null
    this.win.setFullScreen(on)
    this.relayout()
  }

  toggleFullscreen(): void {
    this.win.setFullScreen(!this.win.isFullScreen())
  }

  /** Custom menus cover the whole window so a click anywhere else closes them. */
  showMenuOverlay(items: MenuModel[], x: number, y: number): void {
    const [width, height] = this.win.getContentSize()
    this.showOverlay({ x: 0, y: 0, width, height }, { kind: 'menu', items, x, y }, true)
  }

  showOverlay(rect: Rect, payload: OverlayPayload, focus = false): void {
    this.overlay.setBounds({
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    })
    this.win.contentView.addChildView(this.overlay)
    this.overlayShown = true
    this.overlay.webContents.send('overlay:data', payload)
    if (focus) this.overlay.webContents.focus()
  }

  updateOverlay(payload: OverlayPayload): void {
    if (this.overlayShown) this.overlay.webContents.send('overlay:data', payload)
  }

  resizeOverlay(height: number): void {
    if (!this.overlayShown) return
    const b = this.overlay.getBounds()
    this.overlay.setBounds({ ...b, height: Math.round(height) })
  }

  hideOverlay(): void {
    if (!this.overlayShown) return
    this.overlayShown = false
    this.win.contentView.removeChildView(this.overlay)
    this.send('overlay:closed')
  }

  // ---- shell communication --------------------------------------------------------

  send(channel: string, ...args: unknown[]): void {
    if (!this.win.isDestroyed()) this.win.webContents.send(channel, ...args)
  }

  focusOmnibox(): void {
    this.win.webContents.focus()
    this.send('command', 'focus-omnibox' satisfies ShellCommand)
  }

  tabChanged(): void {
    this.changed()
  }

  private changed(): void {
    scheduleSessionSave()
    if (this.pushQueued) return
    this.pushQueued = true
    setTimeout(() => {
      this.pushQueued = false
      this.send('state', this.state())
    }, 16)
  }

  state(): WindowState {
    return {
      tabs: this.visible().map((t) => t.state()),
      activeId: this.activeId,
      find: this.find,
      fullscreen: this.win.isFullScreen(),
      maximized: this.win.isMaximized(),
      private: this.incognito,
      workspaceId: this.workspaceId,
      islands: [...this.islands].map(([id, i]) => ({ id, ...i })),
      panelId: this.panelId,
      panels: panelStates(),
      split: this.split,
      devtools: !!this.active?.devtools
    }
  }

  snapshot(): WindowSnapshot {
    const active = this.active
    return {
      bounds: this.win.getNormalBounds(),
      maximized: this.win.isMaximized(),
      tabs: this.tabs.map((t) => t.snapshot()),
      active: active ? this.tabs.indexOf(active) : 0,
      workspaceId: this.workspaceId,
      islands: [...this.islands].map(([id, i]) => ({ id, ...i }))
    }
  }

  contextMenu(tab: Tab, params: Electron.ContextMenuParams): void {
    pageContextMenu(this, tab, params)
  }

  // ---- keyboard shortcuts ---------------------------------------------------------

  handleKey(input: Electron.Input): boolean {
    if (input.type !== 'keyDown') return false
    const ctrl = input.control || input.meta
    const { shift, alt } = input
    const key = input.key.toLowerCase()
    const tab = this.active
    const wc = tab?.wc
    const run = (fn: () => void): true => {
      fn()
      return true
    }

    if (ctrl && !alt) {
      if (/^[1-8]$/.test(key)) {
        const target = this.visible()[+key - 1]
        return run(() => target && this.activate(target))
      }
      switch (key) {
        case 't':
          return run(() => (shift ? this.reopenClosed() : this.newTab()))
        case 'n':
          return run(() => BrowserWin.open({ incognito: shift }))
        case 'w':
        case 'f4':
          return run(() => tab && this.closeTab(tab))
        case 'tab':
          return run(() => this.cycle(shift ? -1 : 1))
        case 'pagedown':
          return run(() => this.cycle(1))
        case 'pageup':
          return run(() => this.cycle(-1))
        case '9':
          return run(() => this.activate(this.visible().at(-1)!))
        case 'k':
          return run(() => this.openPalette())
        case 'l':
        case 'e':
          return run(() => this.focusOmnibox())
        case 'r':
          return run(() => tab?.reload(shift))
        case 'f5':
          return run(() => tab?.reload(true))
        case 'f':
          return run(() => this.openFind())
        case 'h':
          return run(() => this.openInternal('history'))
        case 'j':
          return run(() => this.openInternal('downloads'))
        case 'o':
          return shift && run(() => this.openInternal('bookmarks'))
        case 'd':
          return run(() => this.toggleBookmarkActive())
        case 'b':
          return shift && run(() => updateSettings({ showBookmarksBar: !getSettings().showBookmarksBar }))
        case '=':
        case '+':
          return run(() => wc && (stepZoom(wc, 1), this.changed()))
        case '-':
        case '_':
          return run(() => wc && (stepZoom(wc, -1), this.changed()))
        case '0':
          return run(() => wc && (stepZoom(wc, 0), this.changed()))
        case 'p':
          return run(() => wc?.print())
        case 'u':
          return run(() => tab && this.newTab(`view-source:${tab.pageUrl()}`, { opener: tab }))
        case 'i':
          if (shift) return run(() => tab && this.toggleDevTools(tab))
          return false
      }
      return false
    }

    if (ctrl && alt && shift && key === 'i') return run(() => this.win.webContents.openDevTools({ mode: 'detach' }))

    if (alt && !ctrl) {
      switch (key) {
        case 'arrowleft':
          return run(() => wc?.navigationHistory.goBack())
        case 'arrowright':
          return run(() => wc?.navigationHistory.goForward())
        case 'home':
          return run(() => tab && (tab.load(NEW_TAB_URL), this.focusOmnibox()))
        case 'd':
          return run(() => this.focusOmnibox())
      }
      return false
    }

    switch (key) {
      case 'f5':
        return run(() => tab?.reload(shift))
      case 'f6':
        return run(() => this.focusOmnibox())
      case 'f11':
        return run(() => this.toggleFullscreen())
      case 'f12':
        return run(() => tab && this.toggleDevTools(tab))
      case 'f3':
        return run(() => (this.find.open ? this.findQuery(this.find.query, !shift, true) : this.openFind()))
    }
    return false
  }
}


function windowBounds(saved?: Rectangle): Partial<Rectangle> {
  const area = screen.getPrimaryDisplay().workArea
  if (saved) {
    const visible = screen.getAllDisplays().some((d) => {
      const a = d.workArea
      return saved.x < a.x + a.width - 80 && saved.x + saved.width > a.x + 80 && saved.y >= a.y - 10 && saved.y < a.y + a.height - 40
    })
    if (visible) return saved
  }
  const width = Math.min(1360, Math.round(area.width * 0.85))
  const height = Math.min(880, Math.round(area.height * 0.88))
  return { width, height, x: area.x + Math.round((area.width - width) / 2), y: area.y + Math.round((area.height - height) / 2) }
}

function roundRect(r: Rect): Rectangle {
  return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }
}

/** Window buttons (minimize/maximize/close) drawn in the right color for the mode. */
export function titleBarColors(): Electron.TitleBarOverlayOptions {
  const dark = nativeTheme.shouldUseDarkColors
  return { color: '#00000000', symbolColor: dark ? '#e6e9f0' : '#090e17', height: TAB_STRIP_HEIGHT }
}

/** Light/dark mode: Windows' own theme follows it, and with it every page and window. */
export function applyColorMode(mode: 'dark' | 'light' | 'system'): void {
  nativeTheme.themeSource = mode
  repaintWindowChrome()
}

export function repaintWindowChrome(): void {
  for (const w of BrowserWin.all) {
    w.win.setTitleBarOverlay(titleBarColors())
    w.win.setBackgroundColor(nativeTheme.shouldUseDarkColors ? BASE_DARK : BASE_LIGHT)
  }
}
