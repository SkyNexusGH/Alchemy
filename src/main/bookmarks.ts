import { randomUUID } from 'node:crypto'
import type { Bookmark } from '@shared/types'
import { JsonStore } from './store'

export const BAR_ID = 'bar'
export const OTHER_ID = 'other'

const ROOTS: Bookmark[] = [
  { id: BAR_ID, parentId: null, type: 'folder', title: 'Bookmarks bar', created: 0 },
  { id: OTHER_ID, parentId: null, type: 'folder', title: 'Other bookmarks', created: 0 }
]

// Order within a folder is the order of the array.
const store = new JsonStore<{ items: Bookmark[] }>('bookmarks', { items: [...ROOTS] })
const listeners = new Set<() => void>()

export function onBookmarksChanged(fn: () => void): void {
  listeners.add(fn)
}

function changed(): void {
  store.save()
  for (const fn of listeners) fn()
}

export function allBookmarks(): Bookmark[] {
  return store.data.items
}

export function children(parentId: string): Bookmark[] {
  return store.data.items.filter((b) => b.parentId === parentId)
}

export function findByUrl(url: string): Bookmark | undefined {
  return store.data.items.find((b) => b.type === 'url' && b.url === url)
}

export function isBookmarked(url: string): boolean {
  return !!findByUrl(url)
}

export function addBookmark(input: {
  parentId?: string
  type?: 'url' | 'folder'
  title: string
  url?: string
  favicon?: string | null
}): Bookmark {
  const b: Bookmark = {
    id: randomUUID(),
    parentId: input.parentId ?? BAR_ID,
    type: input.type ?? 'url',
    title: input.title,
    url: input.url,
    favicon: input.favicon ?? null,
    created: Date.now()
  }
  store.data.items.push(b)
  changed()
  return b
}

export function updateBookmark(id: string, patch: Partial<Pick<Bookmark, 'title' | 'url' | 'parentId' | 'icon' | 'tags'>>): void {
  const b = store.data.items.find((x) => x.id === id)
  if (!b || b.parentId === null) return
  if (patch.parentId && (patch.parentId === id || isDescendant(patch.parentId, id))) delete patch.parentId
  Object.assign(b, patch)
  if (patch.parentId) {
    // Moving appends to the end of the new folder.
    store.data.items = store.data.items.filter((x) => x.id !== id)
    store.data.items.push(b)
  }
  changed()
}

/** What the last delete took away, with where each item was, so Undo can put it back (#248). */
let lastRemoved: { item: Bookmark; index: number }[] = []

export function undoRemove(): number {
  const back = lastRemoved
  lastRemoved = []
  for (const { item, index } of back.sort((a, b) => a.index - b.index)) store.data.items.splice(Math.min(index, store.data.items.length), 0, item)
  if (back.length) changed()
  return back.length
}

export function removeBookmark(id: string): void {
  const doomed = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const b of store.data.items) {
      if (b.parentId && doomed.has(b.parentId) && !doomed.has(b.id)) {
        doomed.add(b.id)
        grew = true
      }
    }
  }
  lastRemoved = store.data.items.map((item, index) => ({ item, index })).filter(({ item }) => item.parentId !== null && doomed.has(item.id))
  store.data.items = store.data.items.filter((b) => b.parentId === null || !doomed.has(b.id))
  changed()
}

/** Adds the page to the bookmarks bar, or removes it if already bookmarked. */
export function toggleBookmark(url: string, title: string, favicon: string | null): boolean {
  const existing = findByUrl(url)
  if (existing) {
    removeBookmark(existing.id)
    return false
  }
  addBookmark({ url, title: title || url, favicon })
  return true
}

export function searchBookmarks(text: string, limit: number): Bookmark[] {
  const tokens = text.toLowerCase().split(/\s+/).filter(Boolean)
  if (!tokens.length) return []
  return store.data.items
    .filter((b) => b.type === 'url' && tokens.every((t) => `${b.title} ${b.url} ${(b.tags ?? []).map((x) => `#${x}`).join(' ')}`.toLowerCase().includes(t)))
    .slice(0, limit)
}

function isDescendant(candidate: string, ancestor: string): boolean {
  let cur = store.data.items.find((b) => b.id === candidate)
  while (cur?.parentId) {
    if (cur.parentId === ancestor) return true
    cur = store.data.items.find((b) => b.id === cur!.parentId)
  }
  return false
}

// ---- bookmark files (#241, #242): the HTML format every browser imports and exports ------------

const esc = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const unesc = (t: string): string =>
  t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&')

/** All bookmarks as a Netscape bookmark file, which Chrome, Edge, Firefox and Safari can import. */
export function exportHtml(): string {
  const secs = (t: number): number => Math.floor(t / 1000)
  const walk = (parentId: string, indent: string): string =>
    children(parentId)
      .map((b) =>
        b.type === 'folder'
          ? `${indent}<DT><H3 ADD_DATE="${secs(b.created)}"${b.id === BAR_ID ? ' PERSONAL_TOOLBAR_FOLDER="true"' : ''}>${esc(b.title)}</H3>\n${indent}<DL><p>\n${walk(b.id, `${indent}    `)}${indent}</DL><p>\n`
          : `${indent}<DT><A HREF="${esc(b.url ?? '')}" ADD_DATE="${secs(b.created)}"${b.tags?.length ? ` TAGS="${esc(b.tags.join(','))}"` : ''}>${esc(b.title)}</A>\n`
      )
      .join('')
  const roots = ROOTS.map((r) => `    <DT><H3${r.id === BAR_ID ? ' PERSONAL_TOOLBAR_FOLDER="true"' : ''}>${esc(r.title)}</H3>\n    <DL><p>\n${walk(r.id, '        ')}    </DL><p>\n`).join('')
  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<!-- This is an automatically generated file. Exported from Alchemy. -->\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n${roots}</DL><p>\n`
}

/** Reads a bookmark file into a new folder in Other bookmarks. Returns how many were added. */
export function importHtml(html: string, name = 'Imported bookmarks'): number {
  const top = addBookmark({ parentId: OTHER_ID, type: 'folder', title: name })
  const stack = [top.id]
  let pendingFolder: string | null = null
  let count = 0
  const tokens = html.match(/<DT>\s*<H3[^>]*>[\s\S]*?<\/H3>|<DT>\s*<A[^>]*>[\s\S]*?<\/A>|<DL>|<\/DL>/gi) ?? []
  for (const tok of tokens) {
    if (/^<DL>/i.test(tok)) {
      if (pendingFolder) stack.push(pendingFolder)
      pendingFolder = null
    } else if (/^<\/DL>/i.test(tok)) {
      if (stack.length > 1) stack.pop()
    } else if (/<H3/i.test(tok)) {
      const title = unesc(tok.replace(/<[^>]+>/g, '').trim()) || 'Folder'
      pendingFolder = addBookmark({ parentId: stack[stack.length - 1], type: 'folder', title }).id
    } else {
      const href = unesc(tok.match(/HREF="([^"]*)"/i)?.[1] ?? '')
      if (!/^https?:/i.test(href) || isBookmarked(href)) continue
      const title = unesc(tok.replace(/<[^>]+>/g, '').trim()) || href
      const tags = unesc(tok.match(/TAGS="([^"]*)"/i)?.[1] ?? '').split(',').map((t) => t.trim()).filter(Boolean)
      const b = addBookmark({ parentId: stack[stack.length - 1], title, url: href })
      if (tags.length) b.tags = tags
      count++
    }
  }
  // The file's own top folders ("Bookmarks bar", "Other bookmarks") sit inside the new folder.
  store.data.items = store.data.items.filter((b) => b.type === 'url' || b.parentId === null || b.id === top.id || hasUrls(b.id))
  changed()
  return count
}

function hasUrls(folderId: string): boolean {
  return store.data.items.some((b) => b.parentId === folderId && (b.type === 'url' || hasUrls(b.id)))
}
