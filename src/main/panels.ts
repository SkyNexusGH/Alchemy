import { clipboard, session, WebContentsView, type Session } from 'electron'
import { showMenu } from './popup'
import { PANEL_PRESETS, type PanelItem, type PanelState } from '@shared/types'
import { setupBrowsingSession } from './sessions'
import { getSettings, onSettingsChanged } from './settings'
import { JsonStore } from './store'
import type { BrowserWin } from './window'

/**
 * Sites pinned to the side rail (WhatsApp, Discord, Spotify, ...). Each runs in its own
 * view, shared by all windows, in a persistent session of their own so they stay logged
 * in. A panel loads the first time it's opened; closed panels unload after a while.
 */

interface LivePanel {
  view: WebContentsView
  owner: BrowserWin | null
  hiddenSince: number
  unread: number
}

const PANEL_ZOOM = 0.8
const meta = new JsonStore<{ favicons: Record<string, string> }>('panels', { favicons: {} })
const live = new Map<string, LivePanel>()
let panelSession: Session | null = null
let notify: () => void = () => {}
let fallbackWindow: () => BrowserWin | undefined = () => undefined

export function initPanels(opts: { onChange: () => void; focusedWindow: () => BrowserWin | undefined }): void {
  notify = opts.onChange
  fallbackWindow = opts.focusedWindow
  void fetchMissingIcons()
  onSettingsChanged((s) => {
    // Panels removed from the rail are unloaded.
    for (const id of [...live.keys()]) if (!s.panels.some((p) => p.id === id)) destroyPanel(id)
    void fetchMissingIcons()
  })
  setInterval(sleepIdlePanels, 60_000)
}

function panelSessionFor(): Session {
  if (!panelSession) {
    panelSession = session.fromPartition('persist:panels')
    // Messengers are useless without notifications, so those are allowed up front.
    setupBrowsingSession(panelSession, { incognito: false, autoAllow: ['notifications'] })
  }
  return panelSession
}

export function panelStates(): PanelState[] {
  return getSettings().panels.map((p) => ({
    ...p,
    favicon: meta.data.favicons[p.id] ?? null,
    loaded: live.has(p.id),
    unread: live.get(p.id)?.unread ?? 0
  }))
}

export function panelView(id: string | null): WebContentsView | null {
  return (id && live.get(id)?.view) || null
}

export function togglePanel(bw: BrowserWin, id: string): void {
  if (bw.panelId === id) hidePanel(bw)
  else showPanel(bw, id)
}

export function showPanel(bw: BrowserWin, id: string): void {
  const item = getSettings().panels.find((p) => p.id === id)
  if (!item) return
  if (bw.panelId) hidePanel(bw)
  const panel = live.get(id) ?? createPanel(item)
  // A panel is one page shared by all windows; take it from wherever it's showing.
  if (panel.owner && panel.owner !== bw) {
    const other = panel.owner
    other.win.contentView.removeChildView(panel.view)
    other.panelId = null
    other.relayout()
  }
  panel.owner = bw
  bw.win.contentView.addChildView(panel.view)
  bw.panelId = id
  bw.relayout()
  panel.view.webContents.focus()
  notify()
}

/** Pictures of sidebar sites as they looked when last closed, for the hover peek. */
const snapshots = new Map<string, string>()

export function panelPreview(id: string): string | null {
  return snapshots.get(id) ?? null
}

async function snapshot(id: string, wc: Electron.WebContents): Promise<void> {
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), 1500))
  const image = await Promise.race([wc.capturePage().catch(() => null), timeout])
  if (image && !image.isEmpty()) snapshots.set(id, `data:image/jpeg;base64,${image.resize({ width: 420 }).toJPEG(80).toString('base64')}`)
}

export function hidePanel(bw: BrowserWin): void {
  const id = bw.panelId
  if (!id) return
  const panel = live.get(id)
  if (panel?.owner === bw) {
    if (!panel.view.webContents.isDestroyed()) void snapshot(id, panel.view.webContents)
    bw.win.contentView.removeChildView(panel.view)
    panel.owner = null
    panel.hiddenSince = Date.now()
  }
  bw.panelId = null
  bw.relayout()
  notify()
}

export function releasePanels(bw: BrowserWin): void {
  for (const panel of live.values()) {
    if (panel.owner !== bw) continue
    panel.owner = null
    panel.hiddenSince = Date.now()
  }
}

export function reloadPanel(id: string): void {
  live.get(id)?.view.webContents.reload()
}

export function destroyPanel(id: string): void {
  const panel = live.get(id)
  if (!panel) return
  if (panel.owner) {
    panel.owner.win.contentView.removeChildView(panel.view)
    panel.owner.panelId = null
    panel.owner.relayout()
  }
  live.delete(id)
  if (!panel.view.webContents.isDestroyed()) panel.view.webContents.close()
  notify()
}

function sleepIdlePanels(): void {
  const minutes = getSettings().panelSleepMinutes
  if (!minutes || getSettings().performance.heavy) return
  for (const [id, panel] of live) {
    if (!panel.owner && Date.now() - panel.hiddenSince > minutes * 60_000) destroyPanel(id)
  }
}

function createPanel(item: PanelItem): LivePanel {
  const view = new WebContentsView({
    webPreferences: {
      session: panelSessionFor(),
      sandbox: true,
      contextIsolation: true,
      spellcheck: true,
      // Keep timers running while hidden so new messages still arrive.
      backgroundThrottling: false
    }
  })
  view.setBorderRadius(8)
  view.setBackgroundColor('#ffffff')
  const panel: LivePanel = { view, owner: null, hiddenSince: Date.now(), unread: 0 }
  live.set(item.id, panel)
  const wc = view.webContents

  wc.on('page-title-updated', (_e, title) => {
    // Most messengers put the unread count in the title: "(3) WhatsApp".
    const m = title.match(/^\((\d+)\)/) ?? title.match(/(\d+)\s+(unread|new)/i)
    const unread = m ? Number(m[1]) : 0
    if (unread !== panel.unread) {
      panel.unread = unread
      notify()
    }
  })
  wc.on('page-favicon-updated', (_e, favicons) => {
    if (!favicons[0] || meta.data.favicons[item.id] === favicons[0]) return
    meta.data.favicons[item.id] = favicons[0]
    meta.save()
    notify()
  })
  // Links clicked in a messenger open as normal tabs.
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) (panel.owner ?? fallbackWindow())?.newTab(url)
    return { action: 'deny' }
  })
  wc.on('context-menu', (_e, p) => {
    const items: Electron.MenuItemConstructorOptions[] = []
    if (p.linkURL) {
      items.push(
        { label: 'Open link in new tab', click: () => (panel.owner ?? fallbackWindow())?.newTab(p.linkURL) },
        { label: 'Copy link address', click: () => clipboard.writeText(p.linkURL) },
        { type: 'separator' }
      )
    }
    if (p.isEditable) {
      items.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }, { type: 'separator' })
    } else if (p.selectionText) {
      items.push({ role: 'copy' }, { type: 'separator' })
    }
    items.push({ label: 'Reload', click: () => wc.reload() }, { label: 'Inspect', click: () => wc.openDevTools({ mode: 'detach' }) })
    const owner = panel.owner
    const at = view.getBounds()
    if (owner) showMenu(owner, items, at.x + p.x, at.y + p.y, wc)
  })

  // Messengers are built for wide windows; a slightly smaller zoom fits them in a sidebar.
  wc.on('did-finish-load', () => wc.setZoomFactor(PANEL_ZOOM))
  wc.loadURL(item.url).catch(() => {})
  return panel
}

let iconSession: Electron.Session | null = null

/** An image at this address, as a data URL (null if it isn't one). */
async function fetchIcon(url: string | null): Promise<string | null> {
  if (!url || !iconSession) return null
  const res = await iconSession.fetch(url, { credentials: 'omit' })
  if (!res.ok) return null
  const bytes = Buffer.from(await res.arrayBuffer())
  let type = res.headers.get('content-type')?.split(';')[0] ?? ''
  // Some sites send icons as a generic download; recognize the common formats by their bytes.
  if (!type.startsWith('image/')) {
    if (bytes.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0]))) type = 'image/x-icon'
    else if (bytes.subarray(1, 4).toString() === 'PNG') type = 'image/png'
    else return null
  }
  return `data:${type};base64,${bytes.toString('base64')}`
}

/** The icon a page declares (<link rel="icon">), for sites without /favicon.ico. */
async function iconFromPage(pageUrl: string): Promise<string | null> {
  const res = await iconSession!.fetch(pageUrl, { credentials: 'omit' })
  if (!res.ok) return null
  const html = (await res.text()).slice(0, 200_000)
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0])
  const icon = links.find((l) => /rel=["'][^"']*\bicon\b/i.test(l) && /href=/i.test(l))
  const href = icon?.match(/href=["']([^"']+)["']/i)?.[1]
  return href ? new URL(href.replace(/&amp;/g, '&'), pageUrl).toString() : null
}

/** A site's icon, fetched once and kept (by panel id). Null when there isn't one. */
async function iconFor(id: string, url: string): Promise<string | null> {
  if (meta.data.favicons[id]) return meta.data.favicons[id]
  try {
    // A separate, cookie-less session: fetching an icon shouldn't identify the user to the site.
    iconSession ??= session.fromPartition('ovyra-icons', { cache: false })
    const icon = (await fetchIcon(new URL('/favicon.ico', url).toString())) ?? (await fetchIcon(await iconFromPage(url)))
    if (!icon) return null
    meta.data.favicons[id] = icon
    meta.save()
    return icon
  } catch {
    return null // offline or no favicon: a colored letter shows instead
  }
}

/** Gets each site's icon up front, so the rail looks right before a panel is ever opened. */
async function fetchMissingIcons(): Promise<void> {
  for (const p of getSettings().panels) {
    if (meta.data.favicons[p.id]) continue
    if (await iconFor(p.id, p.url)) notify()
  }
}

/** Icons for the suggested sites in "Add to sidebar", fetched together. */
export async function presetIcons(): Promise<Record<string, string>> {
  const pairs = await Promise.all(PANEL_PRESETS.map(async (p) => [p.id, await iconFor(p.id, p.url)] as const))
  return Object.fromEntries(pairs.filter((e): e is readonly [string, string] => !!e[1]))
}
