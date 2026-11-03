import { BaseWindow, screen, WebContentsView, type Rectangle } from 'electron'
import { JsonStore } from './store'
import type { Tab } from './tab'

/**
 * Alchemy's floating video player. Instead of Chromium's picture-in-picture window, the
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

// The strip along the top: drag to move, see-through level, click-through, back to the tab,
// close. Its links never load; the main process reads them in will-navigate.
const barHtml = (opacity: number, clickThrough: boolean): string => `<!doctype html><meta charset="utf-8"><style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: transparent; }
  body { font: 600 12px/1 'Segoe UI', system-ui, sans-serif; color: #fff; -webkit-app-region: drag; user-select: none;
    display: flex; align-items: center; justify-content: flex-end; gap: 4px; padding: 0 6px; box-sizing: border-box;
    background: linear-gradient(rgba(0,0,0,.65), rgba(0,0,0,0)); opacity: 0; transition: opacity .15s; }
  body:hover { opacity: 1; }
  a { -webkit-app-region: no-drag; color: inherit; text-decoration: none; height: 24px; padding: 0 10px; border-radius: 999px;
    display: flex; align-items: center; background: rgba(255,255,255,.14); }
  a:hover { background: rgba(255,255,255,.28); }
  a.on { background: #ec4856; }
  span { margin-right: auto; padding-left: 4px; opacity: .8; }
</style><span>Alchemy</span>
<a href="https://float.ovyra/opacity" title="How see-through the player is">${Math.round(opacity * 100)}%</a>
<a href="https://float.ovyra/through" class="${clickThrough ? 'on' : ''}" title="Clicks go through the video to what's behind it (this strip stays clickable)">Click-through</a>
<a href="https://float.ovyra/back">Back to tab</a><a href="https://float.ovyra/close">✕</a>`

const OPACITIES = [1, 0.85, 0.65, 0.45]

/** Remembered between pop-outs and restarts: where the player was, and how it looked. */
const prefs = new JsonStore<{ bounds: Rectangle | null; opacity: number; clickThrough: boolean }>('float', {
  bounds: null,
  opacity: 1,
  clickThrough: false
})

/** The saved place, if it's still on a connected screen; otherwise the main screen's corner. */
function startBounds(): Rectangle {
  const saved = prefs.data.bounds
  if (saved) {
    const area = screen.getDisplayMatching(saved).workArea
    const fits = saved.x >= area.x - 8 && saved.y >= area.y - 8 && saved.x + saved.width <= area.x + area.width + 8 && saved.y + saved.height <= area.y + area.height + 8
    if (fits) return saved
  }
  const area = screen.getPrimaryDisplay().workArea
  return { x: area.x + area.width - 480 - 24, y: area.y + area.height - 270 - 24, width: 480, height: 270 }
}

const BAR_HEIGHT = 34

interface Floating {
  tab: Tab
  win: BaseWindow
  bar: WebContentsView
  css: string | null
  timer: NodeJS.Timeout
  /** Watches the pointer while click-through is on, so the top strip stays clickable. */
  pointer: NodeJS.Timeout | null
}

const floating = new Map<number, Floating>()

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
  const bounds = startBounds()

  const win = new BaseWindow({
    ...bounds,
    frame: false,
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    backgroundColor: '#000000',
    title: tab.title || 'Alchemy video',
    minWidth: 240,
    minHeight: 135
  })
  // Over everything, including the taskbar and borderless games.
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true)

  const bar = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, javascript: false } })
  bar.setBackgroundColor('#00000000')
  const drawBar = (): void =>
    void bar.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(barHtml(prefs.data.opacity, prefs.data.clickThrough))}`)
  drawBar()
  bar.webContents.on('will-navigate', (e, url) => {
    e.preventDefault()
    if (url.includes('/back')) onBack()
    else if (url.includes('/opacity')) {
      const i = OPACITIES.indexOf(prefs.data.opacity)
      prefs.data.opacity = OPACITIES[(i + 1) % OPACITIES.length]
      prefs.save()
      win.setOpacity(prefs.data.opacity)
      drawBar()
    } else if (url.includes('/through')) {
      prefs.data.clickThrough = !prefs.data.clickThrough
      prefs.save()
      applyClickThrough(entry)
      drawBar()
    } else unfloatTab(tab, { pause: true })
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
  // Remember where it was put, screen included, for next time.
  const remember = (): void => {
    if (win.isDestroyed()) return
    prefs.data.bounds = win.getBounds()
    prefs.save()
  }
  win.on('moved', remember)
  win.on('resized', remember)
  win.setOpacity(prefs.data.opacity)
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
    }, 1500),
    pointer: null
  }
  floating.set(tab.id, entry)
  applyClickThrough(entry)
  tab.wc?.once('destroyed', () => {
    if (floating.get(tab.id) === entry) unfloatTab(tab)
  })
  void tab.wc?.insertCSS(VIDEO_CSS).then((key) => {
    if (floating.get(tab.id) === entry) entry.css = key
  })
  win.showInactive()
}

/**
 * Click-through: the video lets clicks pass to whatever is behind it (a game), while the strip
 * along the top stays clickable so the setting can be turned off again.
 */
function applyClickThrough(entry: Floating): void {
  const { win } = entry
  if (entry.pointer) clearInterval(entry.pointer)
  entry.pointer = null
  if (win.isDestroyed()) return
  if (!prefs.data.clickThrough) {
    win.setIgnoreMouseEvents(false)
    return
  }
  let ignoring: boolean | null = null
  const check = (): void => {
    if (win.isDestroyed()) return
    const p = screen.getCursorScreenPoint()
    const b = win.getContentBounds()
    const overStrip = p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + BAR_HEIGHT
    if (ignoring === !overStrip) return
    ignoring = !overStrip
    // forward: hovering still reaches the page, so the strip fades in under the pointer.
    win.setIgnoreMouseEvents(ignoring, { forward: true })
  }
  check()
  entry.pointer = setInterval(check, 80)
}

/** Takes the page out of its floating window. It's the caller's job to show it again. */
export function unfloatTab(tab: Tab, opts: { pause?: boolean; closing?: boolean } = {}): void {
  const entry = floating.get(tab.id)
  if (!entry) return
  floating.delete(tab.id)
  clearInterval(entry.timer)
  if (entry.pointer) clearInterval(entry.pointer)
  const { win, bar } = entry
  if (!win.isDestroyed()) {
    prefs.data.bounds = win.getBounds()
    prefs.save()
    if (tab.view) win.contentView.removeChildView(tab.view)
    win.contentView.removeChildView(bar)
    if (!opts.closing) win.destroy()
  }
  if (!bar.webContents.isDestroyed()) bar.webContents.close()
  tab.view?.setBorderRadius(0)
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
