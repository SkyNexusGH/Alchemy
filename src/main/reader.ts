import type { WebContents } from 'electron'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

/**
 * #1157 Reader view: the page's article (found by Mozilla's Readability, as in Firefox) shown on
 * its own, in a clean column over the page. Right-click → Reader view opens and closes it, and
 * Esc closes it too. Everything happens inside the page; nothing is fetched or sent.
 */

let readability: string | null = null
const library = (): string => (readability ??= readFileSync(createRequire(__filename).resolve('@mozilla/readability/Readability.js'), 'utf8'))

const CSS = `
:host { all: initial; }
.r { position: fixed; inset: 0; overflow-y: auto; background: var(--bg); color: var(--fg); font: 19px/1.7 Georgia, 'Iowan Old Style', serif; }
.r.light { --bg: #fbfaf7; --fg: #1d1d1f; --mute: #6b6b70; --link: #1a5fd0; }
.r.sepia { --bg: #f4ecd8; --fg: #3b2f22; --mute: #7a6a55; --link: #8a4b14; }
.r.dark { --bg: #17171a; --fg: #e6e4df; --mute: #9a9aa0; --link: #8ab4ff; }
.bar { position: sticky; top: 0; display: flex; gap: 6px; justify-content: flex-end; padding: 10px 16px; background: var(--bg); font: 600 13px system-ui, sans-serif; }
.bar button { padding: 6px 12px; border: 1px solid color-mix(in srgb, var(--fg) 18%, transparent); border-radius: 999px; background: none; color: var(--fg); font: inherit; cursor: pointer; }
.bar button:hover { background: color-mix(in srgb, var(--fg) 8%, transparent); }
article { max-width: 680px; margin: 0 auto; padding: 8px 24px 80px; font-size: var(--size, 19px); }
h1 { font-size: 2em; line-height: 1.2; margin: 0.4em 0 0.2em; }
.by { color: var(--mute); font: 14px system-ui, sans-serif; margin-bottom: 2em; }
img, video, figure { max-width: 100%; height: auto; }
a { color: var(--link); }
pre { overflow-x: auto; font-size: 0.8em; }
blockquote { margin: 1em 0; padding-left: 1em; border-left: 3px solid var(--mute); color: var(--mute); }
`

function script(css: string): string {
  return `(() => {
  const old = document.getElementById('__alchemy_reader')
  if (old) { old.remove(); document.documentElement.style.removeProperty('overflow'); return 'closed' }
  const art = new Readability(document.cloneNode(true)).parse()
  if (!art || !art.content) return 'none'
  const host = document.createElement('div')
  host.id = '__alchemy_reader'
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647'
  const root = host.attachShadow({ mode: 'closed' })
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(${JSON.stringify(css)})
  root.adoptedStyleSheets = [sheet]
  const wrap = document.createElement('div')
  const themes = ['light', 'sepia', 'dark']
  let theme = matchMedia('(prefers-color-scheme: dark)').matches ? 2 : 0
  let size = 19
  wrap.className = 'r ' + themes[theme]
  const bar = document.createElement('div')
  bar.className = 'bar'
  const button = (label, title, fn) => { const b = document.createElement('button'); b.textContent = label; b.title = title; b.onclick = fn; bar.appendChild(b) }
  const close = () => { host.remove(); document.documentElement.style.removeProperty('overflow'); removeEventListener('keydown', key, true) }
  button('A−', 'Smaller text', () => article.style.setProperty('--size', (size = Math.max(14, size - 2)) + 'px'))
  button('A+', 'Bigger text', () => article.style.setProperty('--size', (size = Math.min(30, size + 2)) + 'px'))
  button('Light · Sepia · Dark', 'Change the colours', () => { theme = (theme + 1) % 3; wrap.className = 'r ' + themes[theme] })
  button('✕ Close', 'Back to the page (Esc)', close)
  const article = document.createElement('article')
  const h1 = document.createElement('h1')
  h1.textContent = art.title || document.title
  article.appendChild(h1)
  const by = document.createElement('div')
  by.className = 'by'
  by.textContent = [art.byline, art.siteName, art.length ? Math.max(1, Math.round(art.length / 1100)) + ' min read' : ''].filter(Boolean).join(' · ')
  article.appendChild(by)
  // The article, without scripts or event handlers.
  const doc = new DOMParser().parseFromString(art.content, 'text/html')
  for (const el of doc.querySelectorAll('script, style, iframe, object, embed, form')) el.remove()
  for (const el of doc.querySelectorAll('*')) for (const a of [...el.attributes]) if (/^on/i.test(a.name) || /^javascript:/i.test(a.value)) el.removeAttribute(a.name)
  for (const node of [...doc.body.childNodes]) article.appendChild(document.importNode(node, true))
  wrap.append(bar, article)
  root.appendChild(wrap)
  const key = (e) => { if (e.key === 'Escape') close() }
  addEventListener('keydown', key, true)
  document.documentElement.appendChild(host)
  document.documentElement.style.setProperty('overflow', 'hidden', 'important')
  return 'open'
})()`
}

/** Opens Reader view on the page, or closes it if it's open. */
export async function toggleReader(wc: WebContents): Promise<'open' | 'closed' | 'none'> {
  if (wc.isDestroyed()) return 'none'
  const result = await wc.executeJavaScriptInIsolatedWorld(1003, [{ code: library() }, { code: script(CSS) }]).catch(() => 'none')
  return result === 'open' || result === 'closed' ? result : 'none'
}
