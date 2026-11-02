import { session } from 'electron'
import { engineOf, engineSearchUrl, type LocalSuggestions, type SearchEngineId, type Suggestion } from '@shared/types'
import { toUrl } from '@shared/url'
import { searchBookmarks } from './bookmarks'
import { inlineCandidate, searchUrls, stripUrl } from './history'
import { getSettings } from './settings'

/**
 * Turns whatever the user typed into a URL: either the address itself or a search. With an
 * engine picked (keyword + Tab in the address bar), everything typed is a search.
 */
export function resolveInput(input: string, engine?: SearchEngineId): string {
  const text = input.trim()
  if (!text) return ''
  return (engine ? null : toUrl(text)) ?? searchUrl(text, engine)
}

export function searchUrl(query: string, engine?: SearchEngineId): string {
  return engineSearchUrl(engineOf(getSettings(), engine), query)
}

export function looksLikeUrl(input: string): boolean {
  return toUrl(input) !== null
}

export function localSuggestions(text: string): LocalSuggestions {
  const q = text.trim()
  if (!q) return { items: [], inline: null }
  const items: Suggestion[] = []
  const seen = new Set<string>()
  const push = (s: Suggestion): void => {
    const key = s.value.replace(/\/$/, '')
    if (seen.has(key)) return
    seen.add(key)
    items.push(s)
  }

  for (const b of searchBookmarks(q, 3)) {
    push({ kind: 'bookmark', title: b.title, value: b.url!, detail: stripUrl(b.url!), favicon: b.favicon })
  }
  for (const h of searchUrls(q, 6)) {
    push({ kind: 'history', title: h.title || stripUrl(h.url), value: h.url, detail: stripUrl(h.url), favicon: h.favicon })
  }
  return { items: items.slice(0, 6), inline: inlineCandidate(q.toLowerCase()) }
}

// Suggestion requests go through their own in-memory session so the search engine
// never receives the user's cookies alongside what they type.
let suggestSession: Electron.Session | null = null
let inflight: AbortController | null = null

export async function remoteSuggestions(text: string, engine?: SearchEngineId): Promise<string[]> {
  const settings = getSettings()
  const endpoint = engineOf(settings, engine).suggest
  const q = text.trim()
  if (!settings.searchSuggestions || !endpoint || !q || looksLikeUrl(q)) return []
  inflight?.abort()
  const controller = new AbortController()
  inflight = controller
  suggestSession ??= session.fromPartition('ovyra-suggest', { cache: false })
  try {
    const res = await suggestSession.fetch(endpoint.replace('%s', encodeURIComponent(q)), {
      signal: controller.signal,
      credentials: 'omit'
    })
    const body = await res.json()
    const list: unknown = Array.isArray(body) ? body[1] : null
    return Array.isArray(list) ? list.filter((s): s is string => typeof s === 'string').slice(0, 5) : []
  } catch {
    return []
  }
}
