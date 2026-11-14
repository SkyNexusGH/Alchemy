import { nativeTheme, type WebContents } from 'electron'
import { ELIXIRS, type Elixir, type SiteRestyle, type UserScript } from '@shared/types'
import { siteOf } from './privacy/shields'
import { getSettings, onSettingsChanged } from './settings'
import { JsonStore } from './store'

/**
 * Changing how sites look and behave: Force dark, Elixirs (one-tap fixes for popular sites),
 * MyHue Restyle (your own per-site changes) and custom scripts. Everything is applied to each
 * page as it loads, and again whenever a setting changes.
 */

const store = new JsonStore<{
  restyles: Record<string, SiteRestyle>
  scripts: UserScript[]
  /** #686 Elixir fixes fetched from GitHub, by id (and new ones). */
  elixirUpdates?: Record<string, Partial<Elixir>>
  elixirsFetched?: number
  /** #687 How many visits in a row each Elixir found nothing to hide. */
  elixirMisses?: Record<string, number>
}>('sitemods', { restyles: {}, scripts: [] })

// ---- Elixirs: built in, plus fixes from GitHub between releases ---------------------------------

const ELIXIR_SOURCE = 'https://raw.githubusercontent.com/SkyNexusGH/Alchemy/main/elixirs.json'

/** Every Elixir, with the latest fixes, and whether it seems to have stopped working. */
export function elixirList(): Elixir[] {
  const updates = store.data.elixirUpdates ?? {}
  const misses = store.data.elixirMisses ?? {}
  const known = ELIXIRS.map((e) => ({ ...e, ...(updates[e.id] ?? {}) }))
  const added = Object.entries(updates)
    .filter(([id, e]) => !ELIXIRS.some((x) => x.id === id) && e.title && e.site && e.sites?.length && e.css)
    .map(([id, e]) => ({ id, site: e.site!, sites: e.sites!, title: e.title!, hint: e.hint ?? '', css: e.css! }))
  return [...known, ...added].map((e) => ({ ...e, broken: (misses[e.id] ?? 0) >= 5 }))
}

/** CSS from the internet only hides things: nothing that can load or send anything. */
const safeCss = (css: unknown): css is string => typeof css === 'string' && css.length < 4000 && !/url\(|@import|expression\(|javascript:/i.test(css)

export async function updateElixirs(force = false): Promise<void> {
  if (!force && Date.now() - (store.data.elixirsFetched ?? 0) < 24 * 3600_000) return
  try {
    const res = await fetch(ELIXIR_SOURCE, { cache: 'no-store' })
    if (!res.ok) return
    const list = (await res.json()) as Partial<Elixir>[]
    const updates: Record<string, Partial<Elixir>> = {}
    for (const e of Array.isArray(list) ? list : []) {
      if (!e?.id || !/^[a-z0-9-]{3,40}$/.test(e.id) || !safeCss(e.css)) continue
      updates[e.id] = { css: e.css, ...(e.title ? { title: String(e.title).slice(0, 60), hint: String(e.hint ?? '').slice(0, 160), site: String(e.site ?? '').slice(0, 30), sites: (e.sites ?? []).filter((s) => /^[a-z0-9.-]+$/.test(s)) } : {}) }
    }
    store.data.elixirUpdates = updates
    store.data.elixirsFetched = Date.now()
    store.save()
    reapply()
  } catch {
    /* offline: the built-in ones keep working */
  }
}

/** #687 After a page has settled, did each Elixir on it find anything to hide? */
function checkElixirs(wc: WebContents, url: string): void {
  const site = siteOf(url)
  const on = elixirList().filter((e) => getSettings().elixirs?.[e.id] && e.sites.includes(site))
  if (!on.length) return
  setTimeout(() => {
    if (wc.isDestroyed() || siteOf(wc.getURL()) !== site) return
    const selectors = on.map((e) => e.css.replace(/\{[^}]*\}/g, ',').replace(/,\s*$/, '').trim())
    void wc
      .executeJavaScript(`${JSON.stringify(selectors)}.map((s) => { try { return !!document.querySelector(s) } catch { return true } })`, true)
      .then((found: boolean[]) => {
        const misses = { ...(store.data.elixirMisses ?? {}) }
        on.forEach((e, i) => (misses[e.id] = found[i] ? 0 : (misses[e.id] ?? 0) + 1))
        store.data.elixirMisses = misses
        store.save()
      })
      .catch(() => {})
  }, 5000)
}

const live = new Set<WebContents>()

/**
 * Inverts the page, then inverts pictures and videos back so they keep their real colours.
 * Hue is turned back too, so brand colours stay recognisable; brightness and contrast follow
 * Settings (#674, #677), and photos can be dimmed a little (#678).
 */
function darkCss(kind: 'page' | 'document'): string {
  const s = getSettings()
  const tune = `brightness(${(s.forceDarkBrightness ?? 100) / 100}) contrast(${(s.forceDarkContrast ?? 100) / 100})`
  const dim = s.forceDarkDimImages ? ' brightness(0.85)' : ''
  // A PDF or plain text file is one picture-like page: invert it all (#680).
  if (kind === 'document') return `html { filter: invert(0.92) hue-rotate(180deg) ${tune} !important; background: #fff !important; }`
  return `
html { filter: invert(0.94) hue-rotate(180deg) ${tune} !important; background: #fff !important; }
img, video, picture, canvas, svg image, iframe, embed, object, [style*="background-image"] {
  filter: invert(1) hue-rotate(180deg)${dim} !important;
}`
}

// Runs in the page: is it already dark? Then Force dark leaves it alone. The background is
// looked for where you actually see it (#673): a page whose own background is see-through is
// judged by what's behind its content and by the colour of its text.
const IS_LIGHT = `(() => {
  if (document.contentType === 'application/pdf' || document.contentType === 'text/plain') return 'document'
  const parse = (c) => { const m = c.match(/[\\d.]+/g); if (!m) return null; const [r, g, b, a = 1] = m.map(Number); return a < 0.1 ? null : (r * 299 + g * 587 + b * 114) / 1000 }
  const bgAt = (el) => { for (let e = el; e; e = e.parentElement) { const v = parse(getComputedStyle(e).backgroundColor); if (v !== null) return v } return null }
  const samples = []
  for (const [x, y] of [[0.5, 0.5], [0.25, 0.3], [0.75, 0.3], [0.5, 0.85]]) {
    const el = document.elementFromPoint(innerWidth * x, innerHeight * y)
    const v = el ? bgAt(el) : null
    if (v !== null) samples.push(v)
  }
  if (samples.length) return samples.filter((v) => v > 128).length >= samples.length / 2
  const text = document.body ? parse(getComputedStyle(document.body).color) : null
  return text === null ? true : text < 128
})()`

/** #676 Force dark is on now: always, at night, or while Windows is dark. */
function darkTime(): boolean {
  const when = getSettings().forceDarkWhen ?? 'always'
  if (when === 'system') return nativeTheme.shouldUseDarkColors
  if (when === 'night') {
    const h = new Date().getHours()
    return h >= 19 || h < 7
  }
  return true
}

const fontCss = (r: SiteRestyle): string =>
  (r.font ? `body, body * { font-family: ${JSON.stringify(r.font)}, sans-serif !important; }\n` : '') +
  (r.fontSize ? `html { font-size: ${Number(r.fontSize)}% !important; }\n` : '')

function cssFor(url: string): string {
  const site = siteOf(url)
  const s = getSettings()
  const parts: string[] = []
  for (const e of elixirList()) if (s.elixirs?.[e.id] && e.sites.some((d) => site === d)) parts.push(e.css)
  const r = store.data.restyles[site]
  if (r && !r.paused) {
    if (r.hide.length) parts.push(`${r.hide.join(', ')} { display: none !important; }`)
    parts.push(fontCss(r))
    // #694 Your own colours.
    const c = r.colors ?? {}
    if (c.bg) parts.push(`html, body { background: ${c.bg} !important; } body * { background-color: transparent !important; }`)
    if (c.text) parts.push(`body, body * { color: ${c.text} !important; }`)
    if (c.link) parts.push(`a, a * { color: ${c.link} !important; }`)
    if (r.css) parts.push(r.css)
  }
  return parts.join('\n')
}

export const forceDarkOn = (url: string): boolean => {
  const s = getSettings()
  return !!s.forceDark && darkTime() && !(s.forceDarkOff ?? []).includes(siteOf(url))
}

const applying = new WeakMap<WebContents, Promise<void>>()

function applyCss(wc: WebContents): Promise<void> {
  const next = (applying.get(wc) ?? Promise.resolve()).then(() => applyCssNow(wc)).catch(() => {})
  applying.set(wc, next)
  return next
}

/**
 * Puts the page's Site magic styles in place, replacing whatever was there. A stylesheet of our
 * own (adopted by the page, from Alchemy's isolated world) is used instead of insertCSS, because
 * Electron can't take inserted CSS out again: this way pausing, undoing and switching off take
 * effect at once. Stylesheets made this way aren't blocked by a page's Content-Security-Policy.
 */
const SHEET = (css: string): string => `(() => {
  let s = window.__alchemyMods
  if (!s) s = window.__alchemyMods = new CSSStyleSheet()
  if (!document.adoptedStyleSheets.includes(s)) document.adoptedStyleSheets = [...document.adoptedStyleSheets, s]
  s.replaceSync(${JSON.stringify(css)})
})()`

async function applyCssNow(wc: WebContents): Promise<void> {
  if (wc.isDestroyed()) return
  const url = wc.getURL()
  if (!/^(https?|file):/.test(url)) return
  const parts: string[] = []
  if (/^https?:/.test(url)) parts.push(cssFor(url))
  if (forceDarkOn(url)) {
    const light = (await wc.executeJavaScript(IS_LIGHT, true).catch(() => false)) as boolean | 'document'
    if (light) parts.push(darkCss(light === 'document' ? 'document' : 'page'))
  }
  await wc.executeJavaScriptInIsolatedWorld(1001, [{ code: SHEET(parts.filter(Boolean).join('\n')) }]).catch(() => {})
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
  if (wc.isDestroyed()) return
  const url = wc.getURL()
  if (!/^https?:/.test(url)) return
  for (const script of store.data.scripts) {
    if (!script.enabled || !script.match.split(',').some((m) => matches(m, url))) continue
    // #710 Only the scripts you allowed there run in Masked Mode.
    if (incognito && !script.masked) continue
    // Each runs in its own scope, and one script's error can't stop the page or the others.
    // #706 An error is kept so Settings can show it next to the script.
    void wc
      .executeJavaScript(
        `(() => { try {\n${script.code}\n; return null } catch (e) { console.error('[Alchemy script: ' + ${JSON.stringify(script.name)} + ']', e); return String((e && e.message) || e) } })()`,
        true
      )
      .then((err: string | null) => {
        if (err || script.lastError) {
          script.lastError = err ? { message: err.slice(0, 300), at: Date.now(), url } : undefined
          store.save()
        }
      })
      .catch((e) => {
        // A syntax error never even starts.
        script.lastError = { message: String(e?.message ?? e).slice(0, 300), at: Date.now(), url }
        store.save()
      })
  }
}

/** Reads a userscript's header (// ==UserScript== … // ==/UserScript==). */
export function parseUserScript(code: string): { name?: string; match: string[]; version?: string; updateURL?: string } {
  const head = code.match(/==UserScript==([\s\S]*?)==\/UserScript==/)?.[1] ?? ''
  const meta = (key: string): string[] => [...head.matchAll(new RegExp(`@${key}\\s+(.+)`, 'g'))].map((m) => m[1].trim())
  const toPattern = (m: string): string => {
    if (m === '*' || m === '<all_urls>' || m === '*://*/*') return '*'
    const host = m.replace(/^[a-z*]+:\/\//, '').split('/')[0]
    return host || m
  }
  return {
    name: meta('name')[0],
    match: [...meta('match'), ...meta('include')].map(toPattern),
    version: meta('version')[0],
    updateURL: meta('updateURL')[0] ?? meta('downloadURL')[0]
  }
}

/** #709 Installs a userscript from an address (like a Greasy Fork .user.js link). */
export async function installScript(url: string): Promise<UserScript | string> {
  if (!/^https:\/\/.+/.test(url)) return 'Only https:// addresses can be installed.'
  try {
    const res = await fetch(url)
    if (!res.ok) return `Couldn’t download it (${res.status}).`
    const code = await res.text()
    const meta = parseUserScript(code)
    if (!meta.name) return 'That doesn’t look like a userscript.'
    const script: UserScript = {
      id: crypto.randomUUID(),
      name: meta.name.slice(0, 60),
      match: meta.match.length ? [...new Set(meta.match)].join(', ') : '*',
      code,
      // Off until you've read the warning and turned it on.
      enabled: false,
      sourceUrl: meta.updateURL ?? url,
      version: meta.version
    }
    store.data.scripts = [...store.data.scripts, script]
    store.save()
    return script
  } catch {
    return 'Couldn’t download it.'
  }
}

/** Newer version numbers win: "1.10" is newer than "1.9". */
const newer = (a = '0', b = '0'): boolean => {
  const pa = a.split('.').map((n) => parseInt(n) || 0)
  const pb = b.split('.').map((n) => parseInt(n) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0)
  return false
}

/** Checks scripts installed from an address for a newer version, and updates them. */
export async function updateScripts(): Promise<number> {
  let updated = 0
  for (const s of store.data.scripts) {
    if (!s.sourceUrl) continue
    try {
      const code = await (await fetch(s.sourceUrl, { cache: 'no-store' })).text()
      const meta = parseUserScript(code)
      if (meta.version && newer(meta.version, s.version)) {
        s.code = code
        s.version = meta.version
        updated++
      }
    } catch {
      /* try again next time */
    }
  }
  if (updated) store.save()
  return updated
}

/** Called for every tab: applies mods as its pages load. Custom scripts don't run in Masked Mode. */
export function attachSiteMods(wc: WebContents, incognito: boolean): void {
  live.add(wc)
  wc.once('destroyed', () => live.delete(wc))
  wc.on('dom-ready', () => {
    void applyCss(wc)
    runScripts(wc, incognito)
    checkElixirs(wc, wc.getURL())
  })
}

const reapply = (): void => {
  for (const wc of live) void applyCss(wc)
}

export function initSiteMods(): void {
  void updateElixirs()
  setInterval(() => void updateElixirs(), 6 * 3600_000)
  void updateScripts()
  setInterval(() => void updateScripts(), 24 * 3600_000)
  let key = ''
  onSettingsChanged((s) => {
    const next = JSON.stringify([s.forceDark, s.forceDarkOff, s.elixirs, s.forceDarkWhen, s.forceDarkBrightness, s.forceDarkContrast, s.forceDarkDimImages])
    if (next === key) return
    key = next
    reapply()
  })
  // The schedule: night starts and ends, or Windows switches theme.
  let wasDark = darkTime()
  const check = (): void => {
    if (darkTime() === wasDark) return
    wasDark = darkTime()
    if (getSettings().forceDark) reapply()
  }
  setInterval(check, 60_000)
  nativeTheme.on('updated', check)
}

// ---- MyHue Restyle ----------------------------------------------------------------------

/** #697 Gives another site the same changes (hidden parts usually only fit the original). */
export function copyRestyle(from: string, to: string, withHidden = false): boolean {
  const r = store.data.restyles[from]
  const target = to.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
  if (!r || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(target)) return false
  setRestyle(target, { ...r, hide: withHidden ? [...r.hide] : [], paused: false })
  return true
}

export const restyleFor = (site: string): SiteRestyle => store.data.restyles[site] ?? { hide: [], css: '' }

export const allRestyles = (): Record<string, SiteRestyle> => store.data.restyles

export function setRestyle(site: string, r: SiteRestyle | null): void {
  const colors = r?.colors && (r.colors.bg || r.colors.text || r.colors.link)
  if (!r || (!r.hide.length && !r.css && !r.font && !r.fontSize && !colors)) delete store.data.restyles[site]
  else store.data.restyles[site] = r
  store.save()
  reapply()
}

// Runs in the page: you hover and click something, and it answers with a CSS selector for it.
// Hover to see what would go, click to hide it. Shift+click keeps picking, so several things
// can go in one go; the arrow keys grow the box to its parent or shrink it back. Resolves with
// the selectors picked (empty if cancelled).
const PICKER = `new Promise((resolve) => {
  const picked = []
  const box = document.createElement('div')
  box.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;background:rgba(236,72,86,.25);outline:2px solid #ec4856;border-radius:3px;transition:all 60ms'
  document.documentElement.appendChild(box)
  const tip = document.createElement('div')
  const say = () => { tip.textContent = (picked.length ? picked.length + ' hidden. ' : '') + 'Click to hide · Shift+click to pick more · ↑ ↓ bigger or smaller · Esc to finish' }
  say()
  tip.style.cssText = 'position:fixed;z-index:2147483647;left:50%;top:12px;transform:translateX(-50%);padding:8px 14px;border-radius:99px;background:#131b2a;color:#fff;font:600 13px system-ui;pointer-events:none;white-space:nowrap'
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
  let target = null
  const trail = []
  const show = () => {
    if (!target) return
    const r = target.getBoundingClientRect()
    box.style.left = r.left + 'px'; box.style.top = r.top + 'px'; box.style.width = r.width + 'px'; box.style.height = r.height + 'px'
  }
  const ok = (el) => el && el !== document.body && el !== document.documentElement
  const finish = () => {
    box.remove(); tip.remove()
    removeEventListener('mousemove', move, true); removeEventListener('click', click, true); removeEventListener('keydown', key, true)
    resolve(picked)
  }
  const move = (e) => { if (e.target !== target) { target = e.target; trail.length = 0; show() } }
  const click = (e) => {
    e.preventDefault(); e.stopPropagation()
    if (!ok(target)) return
    picked.push(selector(target))
    target.style.setProperty('display', 'none', 'important')
    target = null; trail.length = 0; box.style.width = '0'; say()
    if (!e.shiftKey) finish()
  }
  const key = (e) => {
    if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); finish() }
    else if (e.key === 'ArrowUp' && ok(target?.parentElement)) { e.preventDefault(); trail.push(target); target = target.parentElement; show() }
    else if (e.key === 'ArrowDown' && trail.length) { e.preventDefault(); target = trail.pop(); show() }
  }
  addEventListener('mousemove', move, true); addEventListener('click', click, true); addEventListener('keydown', key, true)
})`

/** Lets you click parts of the page to hide them; returns how many were hidden. */
export async function pickAndHide(wc: WebContents): Promise<number> {
  const picked = ((await wc.executeJavaScript(PICKER, true).catch(() => [])) as string[]) ?? []
  if (!picked.length) return 0
  const site = siteOf(wc.getURL())
  const r = restyleFor(site)
  setRestyle(site, { ...r, hide: [...r.hide, ...picked] })
  lastPick.set(site, picked.length)
  return picked.length
}

/** How many selectors the last pick on each site added, so Undo takes them all back. */
const lastPick = new Map<string, number>()

/** Undoes the most recent "hide" on this site. */
export function undoLastHide(wc: WebContents): void {
  const site = siteOf(wc.getURL())
  const r = restyleFor(site)
  const n = lastPick.get(site) ?? 1
  lastPick.delete(site)
  setRestyle(site, { ...r, hide: r.hide.slice(0, -n) })
}

// ---- custom scripts -----------------------------------------------------------------------

export const listScripts = (): UserScript[] => store.data.scripts

export function saveScripts(scripts: UserScript[]): void {
  store.data.scripts = scripts
  store.save()
}
