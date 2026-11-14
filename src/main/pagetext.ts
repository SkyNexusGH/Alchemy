import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import type { Tab } from './tab'

/**
 * The words on the pages in your tabs, kept in memory only, for searching inside tabs and for
 * Ask the page. A tab that's asleep answers from what it said before it went to sleep.
 */
const CACHE_MS = 20_000
const MAX_CHARS = 200_000
const cache = new WeakMap<Tab, { at: number; url: string; text: string }>()

export async function pageText(tab: Tab): Promise<string> {
  const url = tab.pageUrl()
  if (!/^https?:/.test(url)) return ''
  const hit = cache.get(tab)
  const fresh = hit && hit.url === url && Date.now() - hit.at < CACHE_MS
  const wc = tab.wc
  if (fresh || !wc || wc.isDestroyed() || wc.isLoading()) return hit?.url === url ? hit.text : ''
  const js = `document.contentType === 'application/pdf' ? '%PDF%' : (document.body ? document.body.innerText : '').slice(0, ${MAX_CHARS})`
  const timeout = new Promise<string>((r) => setTimeout(() => r(''), 1500))
  let text = await Promise.race([wc.executeJavaScript(js, true).catch(() => '') as Promise<string>, timeout])
  // The PDF viewer has no text of its own to read, so the file itself is read.
  if (text === '%PDF%') text = await pdfText(tab, url)
  if (text) cache.set(tab, { at: Date.now(), url, text })
  return text || (hit?.url === url ? hit.text : '')
}

/** The text of a PDF, read with pdf.js (fetched again from the tab's own session, so logins work). */
async function pdfText(tab: Tab, url: string): Promise<string> {
  try {
    const res = await tab.wc!.session.fetch(url)
    const data = new Uint8Array(await res.arrayBuffer())
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(createRequire(__filename).resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href
    const task = pdfjs.getDocument({ data, useSystemFonts: true })
    const doc = await task.promise
    let out = ''
    for (let i = 1; i <= Math.min(doc.numPages, 300) && out.length < MAX_CHARS; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      out += content.items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n\n'
    }
    void task.destroy()
    return out.slice(0, MAX_CHARS)
  } catch (err) {
    console.error('[pagetext] could not read the PDF', err)
    return ''
  }
}

/** Pages for Ask: the tab you're on, or every tab, as plain text. */
export async function aiDocs(tabs: Tab[]): Promise<{ id: number; title: string; url: string; text: string }[]> {
  const docs = await Promise.all(tabs.map(async (t) => ({ id: t.id, title: t.title, url: t.pageUrl(), text: await pageText(t) })))
  return docs.filter((d) => d.text.trim().length > 0)
}

/** Text from the web for Instant answers: Wikipedia's best matches for a question. */
export async function webSnippets(question: string): Promise<{ id: number; title: string; url: string; text: string }[]> {
  const q = question.replace(/[?]+$/, '').replace(/^(who|what|when|where|why|how|which)\s+(is|are|was|were|did|does|do|many|much|tall|old|long|far|big)?\s*(the|a|an)?\s*/i, '')
  const api = `https://en.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrlimit=3&prop=extracts&exintro=1&explaintext=1&redirects=1&gsrsearch=${encodeURIComponent(q || question)}`
  try {
    const data = (await (await fetch(api, { headers: { 'User-Agent': 'Alchemy browser instant answers' } })).json()) as {
      query?: { pages?: Record<string, { title: string; extract?: string; index?: number }> }
    }
    const pages = Object.values(data.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    return pages
      .filter((p) => p.extract)
      .map((p, i) => ({ id: i, title: `${p.title} (Wikipedia)`, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`, text: p.extract! }))
  } catch {
    return []
  }
}

export interface TabMatch {
  tabId: number
  title: string
  url: string
  favicon: string | null
  snippet: string
}

/** Finds the tabs whose page contains the words typed, with a snippet around the first match. */
export async function searchTabs(tabs: Tab[], query: string): Promise<TabMatch[]> {
  const q = query.trim().toLowerCase()
  if (q.length < 3) return []
  const out: TabMatch[] = []
  await Promise.all(
    tabs.map(async (tab) => {
      const text = await pageText(tab)
      const at = text.toLowerCase().indexOf(q)
      if (at === -1) return
      const start = Math.max(0, at - 30)
      const snippet = `${start ? '…' : ''}${text.slice(start, at + q.length + 50).replace(/\s+/g, ' ').trim()}…`
      out.push({ tabId: tab.id, title: tab.title, url: tab.pageUrl(), favicon: tab.favicon, snippet })
    })
  )
  return out.slice(0, 8)
}
