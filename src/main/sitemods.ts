import type { WebContents } from 'electron'
import { ELIXIRS, type SiteRestyle, type UserScript } from '@shared/types'
import { siteOf } from './privacy/shields'
import { getSettings, onSettingsChanged } from './settings'
import { JsonStore } from './store'

/**
 * Changing how sites look and behave: Force dark, Elixirs (one-tap fixes for popular sites),
 * MyHue Restyle (your own per-site changes) and custom scripts. Everything is applied to each
 * page as it loads, and again whenever a setting changes.
 */

const store = new JsonStore<{ restyles: Record<string, SiteRestyle>; scripts: UserScript[] }>('sitemods', { restyles: {}, scripts: [] })

const live = new Set<WebContents>()
/** The CSS currently inserted into each page, so it can be taken out again. */
const inserted = new WeakMap<WebContents, string[]>()

// Inverts the page, then inverts pictures and videos back so they keep their real colours.
const DARK_CSS = `
html { filter: invert(1) hue-rotate(180deg) !important; background: #fff !important; }
img, video, picture, canvas, svg image, iframe, embed, object, [style*="background-image"] {
  filter: invert(1) hue-rotate(180deg) !important;
}`

// Runs in the page: is it already dark? Then Force dark leaves it alone.
const IS_LIGHT = `(() => {
  const parse = (c) => { const m = c.match(/[\\d.]+/g); if (!m) return null; const [r, g, b, a = 1] = m.map(Number); return a < 0.1 ? null : (r * 299 + g * 587 + b * 114) / 1000 }
  const body = document.body ? parse(getComputedStyle(document.body).backgroundColor) : null
  const root = parse(getComputedStyle(document.documentElement).backgroundColor)
  const v = body ?? root
  return v === null ? true : v > 128
})()`

const fontCss = (r: SiteRestyle): string =>
  (r.font ? `body, body * { font-family: ${JSON.stringify(r.font)}, sans-serif !important; }\n` : '') +
  (r.fontSize ? `html { font-size: ${Number(r.fontSize)}% !important; }\n` : '')

function cssFor(url: string): string {
  const site = siteOf(url)
  const s = getSettings()
  const parts: string[] = []
  for (const e of ELIXIRS) if (s.elixirs?.[e.id] && e.sites.some((d) => site === d)) parts.push(e.css)
  const r = store.data.restyles[site]
  if (r) {
    if (r.hide.length) parts.push(`${r.hide.join(', ')} { display: none !important; }`)
    parts.push(fontCss(r))
    if (r.css) parts.push(r.css)
  }
  return parts.join('\n')
}

const forceDarkOn = (url: string): boolean => {
  const s = getSettings()
  return !!s.forceDark && !(s.forceDarkOff ?? []).includes(siteOf(url))
}

const applying = new WeakMap<WebContents, Promise<void>>()

function applyCss(wc: WebContents): Promise<void> {
  const next = (applying.get(wc) ?? Promise.resolve()).then(() => applyCssNow(wc)).catch(() => {})
  applying.set(wc, next)
  return next
}

async function applyCssNow(wc: WebContents): Promise<void> {
  if (wc.isDestroyed()) return
  const url = wc.getURL()
  for (const key of inserted.get(wc) ?? []) await wc.removeInsertedCSS(key).catch(() => {})
  inserted.delete(wc)
  if (!/^https?:/.test(url)) return
  const keys: string[] = []
  const css = cssFor(url)
  if (css) keys.push(await wc.insertCSS(css, { cssOrigin: 'user' }))
  if (forceDarkOn(url)) {
    const light = await wc.executeJavaScript(IS_LIGHT, true).catch(() => false)
    if (light) keys.push(await wc.insertCSS(DARK_CSS, { cssOrigin: 'user' }))
  }
  inserted.set(wc, keys)
}

/** `*.example.com`, `example.com`, `https://example.com/path*` or `*` for every site. */
function matches(pattern: string, url: string): boolean {
  const p = pattern.trim()
  if (!p) return false
  const escape = (t: string): string => t.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  if (/^https?:/.test(p)) return new RegExp(`^${escape(p)}$`).test(url)
  let host = ''
  try {
    host = new URL(url).hostname
  } catch {
    return false
  }
  const bare = p.replace(/^\*\./, '')
  return p === '*' || host === bare || host.endsWith(`.${bare}`)
}

function runScripts(wc: WebContents, incognito: boolean): void {
  if (wc.isDestroyed() || incognito) return
  const url = wc.getURL()
  if (!/^https?:/.test(url)) return
  for (const script of store.data.scripts) {
    if (!script.enabled || !script.match.split(',').some((m) => matches(m, url))) continue
    // Each runs in its own scope, and one script's error can't stop the page or the others.
    void wc.executeJavaScript(`(() => { try {\n${script.code}\n} catch (e) { console.error('[Alchemy script: ' + ${JSON.stringify(script.name)} + ']', e) } })()`, true).catch(() => {})
  }
}

/** Called for every tab: applies mods as its pages load. Custom scripts don't run in Masked Mode. */
export function attachSiteMods(wc: WebContents, incognito: boolean): void {
  live.add(wc)
  wc.once('destroyed', () => live.delete(wc))
  wc.on('did-start-navigation', (d) => {
    if (d.isMainFrame && !d.isSameDocument) inserted.delete(wc)
  })
  wc.on('dom-ready', () => {
    void applyCss(wc)
    runScripts(wc, incognito)
  })
}

const reapply = (): void => {
  for (const wc of live) void applyCss(wc)
}

export function initSiteMods(): void {
  let key = ''
  onSettingsChanged((s) => {
    const next = JSON.stringify([s.forceDark, s.forceDarkOff, s.elixirs])
    if (next === key) return
    key = next
    reapply()
  })
}

// ---- MyHue Restyle ----------------------------------------------------------------------

export const restyleFor = (site: string): SiteRestyle => store.data.restyles[site] ?? { hide: [], css: '' }

export const allRestyles = (): Record<string, SiteRestyle> => store.data.restyles

export function setRestyle(site: string, r: SiteRestyle | null): void {
  if (!r || (!r.hide.length && !r.css && !r.font && !r.fontSize)) delete store.data.restyles[site]
  else store.data.restyles[site] = r
  store.save()
  reapply()
}

// Runs in the page: you hover and click something, and it answers with a CSS selector for it.
const PICKER = `new Promise((resolve) => {
  const box = document.createElement('div')
  box.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;background:rgba(236,72,86,.25);outline:2px solid #ec4856;border-radius:3px;transition:all 60ms'
  document.documentElement.appendChild(box)
  const tip = document.createElement('div')
  tip.textContent = 'Click what you want to hide. Esc to cancel.'
  tip.style.cssText = 'position:fixed;z-index:2147483647;left:50%;top:12px;transform:translateX(-50%);padding:8px 14px;border-radius:99px;background:#131b2a;color:#fff;font:600 13px system-ui;pointer-events:none'
  document.documentElement.appendChild(tip)
  const selector = (el) => {
    const parts = []
    for (let e = el; e && e.nodeType === 1 && e !== document.documentElement && parts.length < 5; e = e.parentElement) {
      if (e.id && !/\\d{3,}/.test(e.id)) { parts.unshift('#' + CSS.escape(e.id)); break }
      const siblings = e.parentElement ? [...e.parentElement.children].filter((c) => c.tagName === e.tagName) : []
      parts.unshift(e.tagName.toLowerCase() + (siblings.length > 1 ? ':nth-of-type(' + (siblings.indexOf(e) + 1) + ')' : ''))
    }
    return parts.join(' > ')
  }
  const finish = (value) => {
    box.remove(); tip.remove()
    removeEventListener('mousemove', move, true); removeEventListener('click', click, true); removeEventListener('keydown', key, true)
    resolve(value)
  }
  const move = (e) => { const r = e.target.getBoundingClientRect(); box.style.left = r.left + 'px'; box.style.top = r.top + 'px'; box.style.width = r.width + 'px'; box.style.height = r.height + 'px' }
  const click = (e) => { e.preventDefault(); e.stopPropagation(); if (e.target !== document.body && e.target !== document.documentElement) finish(selector(e.target)) }
  const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); finish(null) } }
  addEventListener('mousemove', move, true); addEventListener('click', click, true); addEventListener('keydown', key, true)
})`

/** Lets you click part of the page to hide it; returns what was hidden. */
export async function pickAndHide(wc: WebContents): Promise<string | null> {
  const selector = (await wc.executeJavaScript(PICKER, true).catch(() => null)) as string | null
  if (!selector) return null
  const site = siteOf(wc.getURL())
  const r = restyleFor(site)
  setRestyle(site, { ...r, hide: [...r.hide, selector] })
  return selector
}

/** Undoes the most recent "hide" on this site. */
export function undoLastHide(wc: WebContents): void {
  const site = siteOf(wc.getURL())
  const r = restyleFor(site)
  setRestyle(site, { ...r, hide: r.hide.slice(0, -1) })
}

// ---- custom scripts -----------------------------------------------------------------------

export const listScripts = (): UserScript[] => store.data.scripts

export function saveScripts(scripts: UserScript[]): void {
  store.data.scripts = scripts
  store.save()
}
