import type { LaterItem } from '@shared/types'
import { broadcast } from './broadcast'
import { JsonStore } from './store'

/**
 * #1156 The Later list: pages saved to read later, kept apart from bookmarks. Opening one marks
 * it read; read pages can be cleared away.
 */
const store = new JsonStore<{ items: LaterItem[] }>('later', { items: [] })

const changed = (): void => {
  store.save()
  broadcast('later', store.data.items)
}

export const laterItems = (): LaterItem[] => store.data.items

export function addLater(url: string, title: string, favicon: string | null): boolean {
  if (!/^https?:/.test(url)) return false
  store.data.items = [{ url, title: title || url, favicon, added: Date.now(), read: false }, ...store.data.items.filter((i) => i.url !== url)]
  changed()
  return true
}

export function setLaterRead(url: string, read: boolean): void {
  const item = store.data.items.find((i) => i.url === url)
  if (!item) return
  item.read = read
  changed()
}

export function removeLater(url?: string): void {
  // No address: clear everything that's been read.
  store.data.items = store.data.items.filter((i) => (url ? i.url !== url : !i.read))
  changed()
}
