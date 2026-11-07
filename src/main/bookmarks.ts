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

export function updateBookmark(id: string, patch: Partial<Pick<Bookmark, 'title' | 'url' | 'parentId' | 'icon'>>): void {
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
    .filter((b) => b.type === 'url' && tokens.every((t) => `${b.title} ${b.url}`.toLowerCase().includes(t)))
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
