import type { WebContents } from 'electron'

/**
 * Page translation through Google Translate (the user's choice: the most accurate and
 * covers almost every language). The page's text is sent to Google; nothing else is.
 * Text nodes are translated in place, keeping the page's layout, and can be put back.
 */

const ENDPOINT = 'https://translate.googleapis.com/translate_a/t?client=gtx&sl=auto'
/** Per request: Google rejects very large bodies, and smaller batches show up sooner. */
const BATCH_CHARS = 4500
const BATCH_NODES = 120
const MAX_NODES = 4000
/** Requests in flight at once. */
const PARALLEL = 4

// Runs in the page: finds visible text worth translating and remembers it for undo.
const COLLECT = `(() => {
  const skip = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA', 'INPUT', 'SELECT', 'SVG', 'MATH', 'KBD', 'SAMP'])
  const nodes = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const t = n.nodeValue
      if (!t || t.trim().length < 2 || !/\\p{L}/u.test(t)) return NodeFilter.FILTER_REJECT
      for (let p = n.parentElement; p; p = p.parentElement) {
        if (skip.has(p.tagName) || p.isContentEditable || p.getAttribute('translate') === 'no' || p.classList.contains('notranslate')) return NodeFilter.FILTER_REJECT
      }
      return NodeFilter.FILTER_ACCEPT
    }
  })
  while (walker.nextNode() && nodes.length < ${MAX_NODES}) nodes.push(walker.currentNode)
  window.__alchemyTx = { nodes, original: nodes.map((n) => n.nodeValue) }
  return nodes.map((n) => n.nodeValue)
})()`

/** Translates the page into `target` (e.g. "en"). Returns the language it came from. */
export async function translatePage(wc: WebContents, target: string): Promise<{ ok: boolean; from: string | null }> {
  const texts = (await wc.executeJavaScript(COLLECT, true).catch(() => [])) as string[]
  if (!texts.length) return { ok: false, from: null }
  let from: string | null = null

  // Split into batches up to the size limits.
  const batches: [number, number][] = []
  for (let start = 0; start < texts.length; ) {
    let end = start
    let chars = 0
    while (end < texts.length && end - start < BATCH_NODES && chars + texts[end].length < BATCH_CHARS) chars += texts[end++].length
    if (end === start) end++
    batches.push([start, end])
    start = end
  }

  async function run([start, end]: [number, number]): Promise<boolean> {
    const batch = texts.slice(start, end)
    const body = new URLSearchParams()
    for (const t of batch) body.append('q', t.trim())
    try {
      const res = await fetch(`${ENDPOINT}&tl=${encodeURIComponent(target)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      })
      const data = (await res.json()) as (string | [string, string])[]
      const out = data.map((d, i) => {
        if (Array.isArray(d)) from ??= d[1]
        const text = Array.isArray(d) ? d[0] : d
        // Keep the original's leading/trailing spaces so words don't run together.
        const orig = batch[i] ?? ''
        return orig.match(/^\s*/)![0] + text + orig.match(/\s*$/)![0]
      })
      await wc.executeJavaScript(
        `(() => { const tx = window.__alchemyTx; if (!tx) return; const out = ${JSON.stringify(out)}; out.forEach((t, i) => { const n = tx.nodes[${start} + i]; if (n) n.nodeValue = t }) })()`,
        true
      )
      return true
    } catch {
      return false
    }
  }

  // A few batches at a time, top of the page first, so what you see changes quickly.
  let ok = 0
  for (let i = 0; i < batches.length; i += PARALLEL) {
    const results = await Promise.all(batches.slice(i, i + PARALLEL).map(run))
    ok += results.filter(Boolean).length
    if (!results.some(Boolean)) break
  }
  return { ok: ok > 0, from }
}

/** Puts the page's original text back. */
export async function restorePage(wc: WebContents): Promise<void> {
  await wc
    .executeJavaScript(`(() => { const tx = window.__alchemyTx; if (!tx) return; tx.nodes.forEach((n, i) => { n.nodeValue = tx.original[i] }); delete window.__alchemyTx })()`, true)
    .catch(() => {})
}

/** The page's declared language ("fr", "pt-BR"), or null. */
export async function pageLanguage(wc: WebContents): Promise<string | null> {
  const lang = (await wc.executeJavaScript('document.documentElement.lang || ""', true).catch(() => '')) as string
  return lang.trim() || null
}

/** "pt-BR" → "pt". */
export const baseLang = (lang: string): string => lang.toLowerCase().split(/[-_]/)[0]
