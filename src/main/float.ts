import { BaseWindow, screen, WebContentsView, type Rectangle } from 'electron'
import type { Tab } from './tab'

/**
 * Ovyra's floating video player. Instead of Chromium's picture-in-picture window, the
 * whole tab moves into a small window that keeps putting itself back on top, so a video
 * stays visible over borderless-fullscreen games. Inside the page, the video (marked by
 * the video toolbar with data-ovyra-float) is stretched over everything else.
 */

const VIDEO_CSS = `
  [data-ovyra-float] {
    position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important;
    max-width: none !important; max-height: none !important; margin: 0 !important; transform: none !important;
    z-index: 2147483646 !important; object-fit: contain !important; background: #000 !important;
  }
  html, body { overflow: hidden !important; background: #000 !important; }
  /* The video may sit inside its own stacking context, under site headers: hide the rest. */
  body * { visibility: hidden !important; }
  body [data-ovyra-float] { visibility: visible !important; }
`

// The strip along the top: drag to move, back to the tab, close. Its links never load;
// the main process reads them in will-navigate.
const BAR_HTML = `<!doctype html><meta charset="utf-8"><style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: transparent; }
  body { font: 600 12px/1 'Segoe UI', system-ui, sans-serif; color: #fff; -webkit-app-region: drag; user-select: none;
    display: flex; align-items: center; justify-content: flex-end; gap: 4px; padding: 0 6px; box-sizing: border-box;
    background: linear-gradient(rgba(0,0,0,.65), rgba(0,0,0,0)); opacity: 0; transition: opacity .15s; }
  body:hover { opacity: 1; }
  a { -webkit-app-region: no-drag; color: inherit; text-decoration: none; height: 24px; padding: 0 10px; border-radius: 999px;
    display: flex; align-items: center; background: rgba(255,255,255,.14); }
  a:hover { background: rgba(255,255,255,.28); }
  span { margin-right: auto; padding-left: 4px; opacity: .8; }
</style><span>Ovyra</span><a href="https://float.ovyra/back">Back to tab</a><a href="https://float.ovyra/close">✕</a>`

const BAR_HEIGHT = 34

interface Floating {
  tab: Tab
  win: BaseWindow
  bar: WebContentsView
  css: string | null
  timer: NodeJS.Timeout
}

const floating = new Map<number, Floating>()
let lastBounds: Rectangle | null = null

export function isFloating(tab: Tab | null | undefined): boolean {
  return !!tab && floating.has(tab.id)
}

/** Marks the largest playing video in the tab for floating; false if nothing is playing. */
export async function markPlayingVideo(tab: Tab): Promise<boolean> {
  const wc = tab.wc
  if (!wc || wc.isDestroyed()) return false
  return wc
    .executeJavaScript(
      `(() => {
        const vs = [...document.querySelectorAll('video')].filter((v) => !v.paused && v.readyState >= 2 && v.offsetWidth > 160)
        vs.sort((a, b) => b.offsetWidth * b.offsetHeight - a.offsetWidth * a.offsetHeight)
        if (!vs[0]) return false
        vs[0].setAttribute('data-ovyra-float', '')
        return true
      })()`
    )
    .then(Boolean)
    .catch(() => false)
}

/**
 * Moves the tab's page into a floating window. The page must already have a marked video.
 * `onBack` returns the tab to its browser window (which calls unfloatTab first).
 */
export function floatTab(tab: Tab, onBack: () => void): void {
  const view = tab.view
  if (!view || floating.has(tab.id)) return
  const area = screen.getPrimaryDisplay().workArea
  const width = 480
  const height = 270
  const bounds = lastBounds ?? { x: area.x + area.width - width - 24, y: area.y + area.height - height - 24, width, height }

  const win = new BaseWindow({
    ...bounds,
    frame: false,
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    backgroundColor: '#000000',
    title: tab.title || 'Ovyra video',
    minWidth: 240,
    minHeight: 135
  })
  // Over everything, including the taskbar and borderless games.
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true)

  const bar = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, javascript: false } })
  bar.setBackgroundColor('#00000000')
  void bar.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(BAR_HTML)}`)
  bar.webContents.on('will-navigate', (e, url) => {
    e.preventDefault()
    if (url.includes('/back')) onBack()
    else unfloatTab(tab, { pause: true })
  })

  view.setBorderRadius(0)
  win.contentView.addChildView(view)
  win.contentView.addChildView(bar)
  const fit = (): void => {
    const [w, h] = win.getContentSize()
    view.setBounds({ x: 0, y: 0, width: w, height: h })
    bar.setBounds({ x: 0, y: 0, width: w, height: BAR_HEIGHT })
  }
  fit()
  win.on('resize', fit)
  win.on('close', () => {
    if (floating.has(tab.id)) unfloatTab(tab, { pause: true, closing: true })
  })

  const entry: Floating = {
    tab,
    win,
    bar,
    css: null,
    // Games and some apps push themselves to the front; keep taking the top spot back
    // (without taking keyboard focus).
    timer: setInterval(() => {
      if (!win.isDestroyed()) win.setAlwaysOnTop(true, 'screen-saver')
    }, 1500)
  }
  floating.set(tab.id, entry)
  tab.wc?.once('destroyed', () => {
    if (floating.get(tab.id) === entry) unfloatTab(tab)
  })
  void tab.wc?.insertCSS(VIDEO_CSS).then((key) => {
    if (floating.get(tab.id) === entry) entry.css = key
  })
  win.showInactive()
}

/** Takes the page out of its floating window. It's the caller's job to show it again. */
export function unfloatTab(tab: Tab, opts: { pause?: boolean; closing?: boolean } = {}): void {
  const entry = floating.get(tab.id)
  if (!entry) return
  floating.delete(tab.id)
  clearInterval(entry.timer)
  const { win, bar } = entry
  if (!win.isDestroyed()) {
    lastBounds = win.getBounds()
    if (tab.view) win.contentView.removeChildView(tab.view)
    win.contentView.removeChildView(bar)
    if (!opts.closing) win.destroy()
  }
  if (!bar.webContents.isDestroyed()) bar.webContents.close()
  tab.view?.setBorderRadius(8)
  const wc = tab.wc
  if (wc && !wc.isDestroyed()) {
    if (entry.css) void wc.removeInsertedCSS(entry.css).catch(() => {})
    void wc
      .executeJavaScript(
        `(() => { const v = document.querySelector('[data-ovyra-float]'); if (!v) return; ${opts.pause ? 'v.pause();' : ''} v.removeAttribute('data-ovyra-float') })()`
      )
      .catch(() => {})
  }
}
