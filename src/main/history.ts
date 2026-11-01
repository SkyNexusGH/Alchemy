import type { HistoryVisit } from '@shared/types'
import { JsonStore } from './store'

interface UrlInfo {
  url: string
  title: string
  favicon: string | null
  visits: number
  typed: number
  last: number
}

interface HistoryData {
  visits: HistoryVisit[]
  urls: Record<string, UrlInfo>
}

const MAX_VISITS = 15000
const MAX_URLS = 8000

const store = new JsonStore<HistoryData>('history', { visits: [], urls: {} }, 3000)

export function shouldRecord(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://')
}

export function addVisit(url: string, title: string, favicon: string | null): void {
  if (!shouldRecord(url)) return
  const now = Date.now()
  const last = store.data.visits[store.data.visits.length - 1]
  // Reloads and quick redirects back to the same URL count once.
  if (!(last && last.url === url && now - last.time < 30_000)) {
    store.data.visits.push({ url, title, favicon, time: now })
    if (store.data.visits.length > MAX_VISITS) store.data.visits.splice(0, store.data.visits.length - MAX_VISITS)
  }
  const info = store.data.urls[url]
  if (info) {
    info.visits++
    info.last = now
    if (title) info.title = title
    if (favicon) info.favicon = favicon
  } else {
    store.data.urls[url] = { url, title, favicon, visits: 1, typed: 0, last: now }
    pruneUrls()
  }
  store.save()
}

export function markTyped(url: string): void {
  const info = store.data.urls[url]
  if (info) info.typed++
  else store.data.urls[url] = { url, title: '', favicon: null, visits: 0, typed: 1, last: Date.now() }
  store.save()
}

export function updatePage(url: string, patch: { title?: string; favicon?: string | null }): void {
  const info = store.data.urls[url]
  if (!info) return
  if (patch.title) info.title = patch.title
  if (patch.favicon) info.favicon = patch.favicon
  for (let i = store.data.visits.length - 1, n = 0; i >= 0 && n < 5; i--, n++) {
    const v = store.data.visits[i]
    if (v.url !== url) continue
    if (patch.title) v.title = patch.title
    if (patch.favicon) v.favicon = patch.favicon
    break
  }
  store.save()
}

export function faviconFor(url: string): string | null {
  return store.data.urls[url]?.favicon ?? null
}

/** The best-known favicon for a site, for speed dial tiles. */
export function faviconForSite(url: string): string | null {
  const exact = store.data.urls[url]?.favicon
  if (exact) return exact
  const host = stripUrl(url).split('/')[0]
  let best: UrlInfo | null = null
  for (const info of Object.values(store.data.urls)) {
    if (!info.favicon || stripUrl(info.url).split('/')[0] !== host) continue
    if (!best || info.visits > best.visits) best = info
  }
  return best?.favicon ?? null
}

export function queryVisits(text: string, limit = 300, before = Infinity): HistoryVisit[] {
  const q = text.trim().toLowerCase()
  const out: HistoryVisit[] = []
  for (let i = store.data.visits.length - 1; i >= 0 && out.length < limit; i--) {
    const v = store.data.visits[i]
    if (v.time >= before) continue
    if (q && !v.url.toLowerCase().includes(q) && !v.title.toLowerCase().includes(q)) continue
    out.push(v)
  }
  return out
}

export function deleteVisit(url: string, time: number): void {
  store.data.visits = store.data.visits.filter((v) => !(v.url === url && v.time === time))
  if (!store.data.visits.some((v) => v.url === url)) delete store.data.urls[url]
  store.save()
}

/** Merges history from another browser. Returns how many new pages were added. */
export function importHistory(
  urls: { url: string; title: string; visits: number; typed: number; last: number }[],
  visits: HistoryVisit[]
): number {
  let added = 0
  for (const u of urls) {
    const info = store.data.urls[u.url]
    if (info) {
      info.visits += u.visits
      info.typed += u.typed
      info.last = Math.max(info.last, u.last)
      if (!info.title) info.title = u.title
    } else {
      store.data.urls[u.url] = { url: u.url, title: u.title, favicon: null, visits: u.visits, typed: u.typed, last: u.last }
      added++
    }
  }
  const seen = new Set(store.data.visits.map((v) => `${v.time}|${v.url}`))
  const merged = [...store.data.visits, ...visits.filter((v) => !seen.has(`${v.time}|${v.url}`))]
  merged.sort((a, b) => a.time - b.time)
  store.data.visits = merged.slice(-MAX_VISITS)
  pruneUrls()
  store.save()
  return added
}

export function clearHistory(): void {
  store.data = { visits: [], urls: {} }
  store.save()
}

/** Frecency-ranked URLs matching every token of the query. */
export function searchUrls(text: string, limit: number): UrlInfo[] {
  const tokens = text.toLowerCase().split(/\s+/).filter(Boolean)
  if (!tokens.length) return []
  const now = Date.now()
  const scored: { info: UrlInfo; score: number }[] = []
  for (const info of Object.values(store.data.urls)) {
    const hay = (stripUrl(info.url) + ' ' + info.title).toLowerCase()
    if (!tokens.every((t) => hay.includes(t))) continue
    scored.push({ info, score: frecency(info, now) * (stripUrl(info.url).startsWith(tokens[0]) ? 3 : 1) })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map((s) => s.info)
}

/** Best host (or URL) to autocomplete inline for what the user is typing. */
export function inlineCandidate(text: string): string | null {
  const q = text.toLowerCase()
  if (!q || /\s/.test(q)) return null
  const now = Date.now()
  let best: { value: string; score: number } | null = null
  for (const info of Object.values(store.data.urls)) {
    const stripped = stripUrl(info.url)
    const host = stripped.split('/')[0]
    let candidate: string | null = null
    if (host.startsWith(q)) candidate = host
    else if (q.includes('/') && stripped.startsWith(q)) candidate = stripped.replace(/\/$/, '')
    if (!candidate) continue
    const score = frecency(info, now)
    if (!best || score > best.score) best = { value: candidate, score }
  }
  return best?.value ?? null
}

export function topSites(limit: number): UrlInfo[] {
  const now = Date.now()
  const byHost = new Map<string, { info: UrlInfo; score: number }>()
  for (const info of Object.values(store.data.urls)) {
    const host = stripUrl(info.url).split('/')[0]
    const score = frecency(info, now)
    const cur = byHost.get(host)
    if (!cur || score > cur.score) byHost.set(host, { info, score })
  }
  return [...byHost.values()].sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.info)
}

export function stripUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/^www\./, '')
}

function frecency(info: UrlInfo, now: number): number {
  const days = (now - info.last) / 86_400_000
  const recency = days < 1 ? 1 : days < 4 ? 0.7 : days < 14 ? 0.5 : days < 31 ? 0.3 : 0.1
  return (info.visits + info.typed * 4) * recency
}

function pruneUrls(): void {
  const all = Object.values(store.data.urls)
  if (all.length <= MAX_URLS) return
  all.sort((a, b) => a.last - b.last)
  for (const info of all.slice(0, all.length - MAX_URLS)) delete store.data.urls[info.url]
}
