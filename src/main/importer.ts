import { app } from 'electron'
import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { HistoryVisit, SpeedDialItem } from '@shared/types'
import * as bookmarks from './bookmarks'
import * as history from './history'
import { getSettings, updateSettings } from './settings'

/**
 * Brings bookmarks, history and the speed dial over from other Chromium browsers on this
 * PC. Everything is read from the browser's own profile files; nothing leaves the machine.
 */

export interface ImportSource {
  id: string
  name: string
  hasBookmarks: boolean
  hasHistory: boolean
  hasSpeedDial: boolean
}

export interface ImportResult {
  bookmarks: number
  history: number
  speedDial: number
}

const appData = process.env.APPDATA ?? ''
const localAppData = process.env.LOCALAPPDATA ?? ''

const SOURCES = [
  { id: 'opera-gx', name: 'Opera GX', dir: join(appData, 'Opera Software', 'Opera GX Stable') },
  { id: 'opera', name: 'Opera', dir: join(appData, 'Opera Software', 'Opera Stable') },
  { id: 'brave', name: 'Brave', dir: join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data') },
  { id: 'chrome', name: 'Google Chrome', dir: join(localAppData, 'Google', 'Chrome', 'User Data') },
  { id: 'edge', name: 'Microsoft Edge', dir: join(localAppData, 'Microsoft', 'Edge', 'User Data') }
]

/** Newer Opera and every Chrome-style browser keep the profile in "Default". */
function profileDir(dir: string): string | null {
  for (const p of [join(dir, 'Default'), dir]) if (existsSync(join(p, 'Bookmarks')) || existsSync(join(p, 'History'))) return p
  return null
}

interface ChromeNode {
  type: 'url' | 'folder'
  name: string
  url?: string
  children?: ChromeNode[]
}

function readBookmarks(profile: string): Record<string, ChromeNode> | null {
  const file = join(profile, 'Bookmarks')
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8')).roots
  } catch {
    return null
  }
}

// ---- Firefox (#243, #304) ---------------------------------------------------------------------

/** Firefox's profile: the one whose places.sqlite was used most recently. */
function firefoxProfile(): string | null {
  const dir = join(appData, 'Mozilla', 'Firefox', 'Profiles')
  if (!existsSync(dir)) return null
  const found = readdirSync(dir)
    .map((p) => join(dir, p))
    .filter((p) => existsSync(join(p, 'places.sqlite')))
    .sort((a, b) => statSync(join(b, 'places.sqlite')).mtimeMs - statSync(join(a, 'places.sqlite')).mtimeMs)
  return found[0] ?? null
}

/** Opens a copy of Firefox's database (it stays locked while Firefox runs). */
function withFirefoxDb<T>(profile: string, fn: (query: (sql: string) => Record<string, unknown>[]) => T): T {
  const copy = join(app.getPath('temp'), `alchemy-firefox-${Date.now()}.sqlite`)
  copyFileSync(join(profile, 'places.sqlite'), copy)
  // Recent changes may still be in the write-ahead log beside it.
  if (existsSync(join(profile, 'places.sqlite-wal'))) copyFileSync(join(profile, 'places.sqlite-wal'), `${copy}-wal`)
  try {
    const db = new DatabaseSync(copy)
    try {
      return fn((sql) => {
        const stmt = db.prepare(sql)
        stmt.setReadBigInts(true)
        return stmt.all()
      })
    } finally {
      db.close()
    }
  } finally {
    rmSync(copy, { force: true })
    rmSync(`${copy}-wal`, { force: true })
    rmSync(`${copy}-shm`, { force: true })
  }
}

function importFirefoxBookmarks(profile: string): number {
  return withFirefoxDb(profile, (query) => {
    const rows = query(
      `SELECT b.id AS id, b.type AS type, b.parent AS parent, b.title AS title, b.guid AS guid, p.url AS url
       FROM moz_bookmarks b LEFT JOIN moz_places p ON p.id = b.fk ORDER BY b.parent, b.position`
    ).map((r) => ({ id: Number(r.id), type: Number(r.type), parent: Number(r.parent), title: String(r.title ?? ''), guid: String(r.guid ?? ''), url: r.url as string | null }))
    const kids = (parent: number): typeof rows => rows.filter((r) => r.parent === parent)
    let count = 0
    const add = (parent: number, into: string): void => {
      for (const r of kids(parent)) {
        if (r.type === 2) {
          if (!kids(r.id).length) continue
          const folder = bookmarks.addBookmark({ parentId: into, type: 'folder', title: r.title || 'Folder' })
          add(r.id, folder.id)
        } else if (r.type === 1 && r.url && /^https?:/.test(r.url) && !bookmarks.isBookmarked(r.url)) {
          bookmarks.addBookmark({ parentId: into, title: r.title || r.url, url: r.url })
          count++
        }
      }
    }
    const root = (guid: string): number | undefined => rows.find((r) => r.guid === guid)?.id
    const toolbar = root('toolbar_____')
    if (toolbar !== undefined && kids(toolbar).length) add(toolbar, bookmarks.addBookmark({ parentId: bookmarks.BAR_ID, type: 'folder', title: 'From Firefox' }).id)
    const rest = ['menu________', 'unfiled_____', 'mobile______'].map(root).filter((x): x is number => x !== undefined && kids(x).length > 0)
    if (rest.length) {
      const other = bookmarks.addBookmark({ parentId: bookmarks.OTHER_ID, type: 'folder', title: 'From Firefox' }).id
      for (const r of rest) add(r, other)
    }
    return count
  })
}

function importFirefoxHistory(profile: string): number {
  return withFirefoxDb(profile, (query) => {
    // Firefox stores times as microseconds since 1970.
    const ms = (t: unknown): number => Number(t ?? 0) / 1000
    const urls = query(
      `SELECT url, title, visit_count AS visits, typed, last_visit_date AS last FROM moz_places
       WHERE hidden = 0 AND last_visit_date IS NOT NULL ORDER BY last_visit_date DESC LIMIT 8000`
    )
    const visits = query(
      `SELECT p.url AS url, p.title AS title, v.visit_date AS time FROM moz_historyvisits v
       JOIN moz_places p ON p.id = v.place_id ORDER BY v.visit_date DESC LIMIT 15000`
    )
    const clean = (u: unknown): u is string => typeof u === 'string' && /^https?:/.test(u)
    return history.importHistory(
      urls.filter((u) => clean(u.url)).map((u) => ({ url: u.url as string, title: String(u.title ?? ''), visits: Number(u.visits), typed: Number(u.typed), last: ms(u.last) })),
      visits.filter((v) => clean(v.url)).map((v): HistoryVisit => ({ url: v.url as string, title: String(v.title ?? ''), favicon: null, time: ms(v.time) }))
    )
  })
}

export function importSources(): ImportSource[] {
  const out: ImportSource[] = []
  const firefox = firefoxProfile()
  if (firefox) out.push({ id: 'firefox', name: 'Firefox', hasBookmarks: true, hasHistory: true, hasSpeedDial: false })
  for (const s of SOURCES) {
    const profile = profileDir(s.dir)
    if (!profile) continue
    const roots = readBookmarks(profile)
    out.push({
      id: s.id,
      name: s.name,
      hasBookmarks: !!roots,
      hasHistory: existsSync(join(profile, 'History')),
      hasSpeedDial: !!(roots?.custom_root as unknown as Record<string, ChromeNode> | undefined)?.speedDial
    })
  }
  return out
}

export function runImport(id: string, what: { bookmarks: boolean; history: boolean; speedDial: boolean }): ImportResult {
  if (id === 'firefox') {
    const profile = firefoxProfile()
    if (!profile) throw new Error('Firefox not found')
    return {
      bookmarks: what.bookmarks ? importFirefoxBookmarks(profile) : 0,
      history: what.history ? importFirefoxHistory(profile) : 0,
      speedDial: 0
    }
  }
  const source = SOURCES.find((s) => s.id === id)
  const profile = source && profileDir(source.dir)
  if (!source || !profile) throw new Error('Browser not found')
  const result: ImportResult = { bookmarks: 0, history: 0, speedDial: 0 }
  const roots = readBookmarks(profile)

  if (what.bookmarks && roots) result.bookmarks = importBookmarks(source.name, roots)
  if (what.speedDial && roots) result.speedDial = importSpeedDial(roots)
  if (what.history && existsSync(join(profile, 'History'))) result.history = importHistory(profile)
  return result
}

function importBookmarks(name: string, roots: Record<string, ChromeNode>): number {
  let count = 0
  const add = (nodes: ChromeNode[] | undefined, parentId: string): void => {
    for (const n of nodes ?? []) {
      if (n.type === 'folder') {
        if (!n.children?.length) continue
        const folder = bookmarks.addBookmark({ parentId, type: 'folder', title: n.name })
        add(n.children, folder.id)
      } else if (n.url && /^https?:/.test(n.url) && !bookmarks.isBookmarked(n.url)) {
        bookmarks.addBookmark({ parentId, title: n.name, url: n.url })
        count++
      }
    }
  }
  const custom = (roots.custom_root ?? {}) as unknown as Record<string, ChromeNode>
  // The bar's items go into a folder on our bar; everything else into "Other bookmarks".
  const barItems = roots.bookmark_bar?.children ?? []
  if (barItems.length) add([{ type: 'folder', name: `From ${name}`, children: barItems }], bookmarks.BAR_ID)
  const rest = [roots.other, roots.synced, custom.userRoot, custom.unsorted].flatMap((r) => r?.children ?? [])
  if (rest.length) add([{ type: 'folder', name: `From ${name}`, children: rest }], bookmarks.OTHER_ID)
  return count
}

/** Opera keeps its speed dial as a special bookmarks folder. */
function importSpeedDial(roots: Record<string, ChromeNode>): number {
  const dial = ((roots.custom_root ?? {}) as unknown as Record<string, ChromeNode>).speedDial
  const urls: { title: string; url: string }[] = []
  const walk = (nodes: ChromeNode[] | undefined): void => {
    for (const n of nodes ?? []) {
      if (n.type === 'folder') walk(n.children)
      else if (n.url && /^https?:/.test(n.url)) urls.push({ title: n.name, url: n.url })
    }
  }
  walk(dial?.children)
  const current = getSettings().speedDial
  const hosts = new Set(current.map((d) => hostKey(d.url)))
  const added: SpeedDialItem[] = []
  for (const u of urls) {
    if (hosts.has(hostKey(u.url)) || current.length + added.length >= 24) continue
    hosts.add(hostKey(u.url))
    added.push({ id: crypto.randomUUID(), title: u.title, url: u.url })
  }
  if (added.length) updateSettings({ speedDial: [...current, ...added] })
  return added.length
}

const hostKey = (url: string): string => {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Chromium stores times as microseconds since 1601. */
const fromChromeTime = (t: number | bigint): number => Number(t) / 1000 - 11_644_473_600_000

function importHistory(profile: string): number {
  // The browser keeps its database open; read a copy so we never touch the original.
  const copy = join(app.getPath('temp'), `alchemy-import-${Date.now()}.sqlite`)
  copyFileSync(join(profile, 'History'), copy)
  try {
    const db = new DatabaseSync(copy, { readOnly: true })
    // Chromium timestamps don't fit in a JS number, so integers come back as BigInt.
    const query = (sql: string): Record<string, unknown>[] => {
      const stmt = db.prepare(sql)
      stmt.setReadBigInts(true)
      return stmt.all()
    }
    const urls = query(
      `SELECT url, title, visit_count AS visits, typed_count AS typed, last_visit_time AS last
       FROM urls WHERE hidden = 0 ORDER BY last_visit_time DESC LIMIT 8000`
    )
    const visits = query(
      `SELECT u.url AS url, u.title AS title, v.visit_time AS time
       FROM visits v JOIN urls u ON u.id = v.url ORDER BY v.visit_time DESC LIMIT 15000`
    )
    db.close()
    const clean = (u: unknown): u is string => typeof u === 'string' && /^https?:/.test(u)
    return history.importHistory(
      urls
        .filter((u) => clean(u.url))
        .map((u) => ({
          url: u.url as string,
          title: String(u.title ?? ''),
          visits: Number(u.visits),
          typed: Number(u.typed),
          last: fromChromeTime(u.last as bigint)
        })),
      visits
        .filter((v) => clean(v.url))
        .map((v): HistoryVisit => ({ url: v.url as string, title: String(v.title ?? ''), favicon: null, time: fromChromeTime(v.time as bigint) }))
    )
  } finally {
    rmSync(copy, { force: true })
  }
}
