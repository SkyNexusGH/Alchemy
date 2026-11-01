import { app, shell, type DownloadItem, type Session } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { DownloadState } from '@shared/types'
import { broadcast } from './broadcast'
import { getSettings } from './settings'
import { JsonStore } from './store'

const MAX_KEPT = 200
const store = new JsonStore<{ list: DownloadState[] }>('downloads', { list: [] })
/** Private-window downloads: shown while private browsing lasts, never written to disk. */
let incognitoList: DownloadState[] = []
const live = new Map<string, { item: DownloadItem; lastBytes: number; lastTime: number }>()
let pushTimer: NodeJS.Timeout | null = null

// Anything still "in progress" from a previous run was cut off when the app closed.
for (const d of store.data.list) if (d.status === 'progressing' || d.status === 'paused') d.status = 'interrupted'

export function listDownloads(): DownloadState[] {
  if (!incognitoList.length) return store.data.list
  return [...incognitoList, ...store.data.list].sort((a, b) => b.started - a.started)
}

export function clearIncognitoDownloads(): void {
  for (const d of incognitoList) live.get(d.id)?.item.cancel()
  incognitoList = []
  changed(true)
}

function forget(predicate: (d: DownloadState) => boolean): void {
  store.data.list = store.data.list.filter((d) => !predicate(d))
  incognitoList = incognitoList.filter((d) => !predicate(d))
}

function changed(immediate = false): void {
  store.save()
  if (immediate) {
    if (pushTimer) clearTimeout(pushTimer)
    pushTimer = null
    broadcast('downloads', listDownloads())
    return
  }
  if (pushTimer) return
  pushTimer = setTimeout(() => {
    pushTimer = null
    broadcast('downloads', listDownloads())
  }, 250)
}

export function trackDownloads(session: Session, opts: { incognito: boolean }): void {
  session.on('will-download', (_e, item) => {
    const settings = getSettings()
    const dir = settings.downloadDir || app.getPath('downloads')
    if (settings.askWhereToSave) item.setSaveDialogOptions({ defaultPath: join(dir, item.getFilename()) })
    else item.setSavePath(uniquePath(dir, item.getFilename()))

    const state: DownloadState = {
      id: randomUUID(),
      url: item.getURL(),
      filename: item.getFilename(),
      path: item.getSavePath(),
      status: 'progressing',
      received: 0,
      total: item.getTotalBytes(),
      speed: 0,
      started: Date.now(),
      incognito: opts.incognito || undefined
    }
    if (opts.incognito) incognitoList.unshift(state)
    else {
      store.data.list.unshift(state)
      if (store.data.list.length > MAX_KEPT) store.data.list.length = MAX_KEPT
    }
    const entry = { item, lastBytes: 0, lastTime: Date.now() }
    live.set(state.id, entry)

    item.on('updated', (_ev, s) => {
      const now = Date.now()
      const bytes = item.getReceivedBytes()
      if (now - entry.lastTime >= 500) {
        state.speed = ((bytes - entry.lastBytes) * 1000) / (now - entry.lastTime)
        entry.lastBytes = bytes
        entry.lastTime = now
      }
      state.path = item.getSavePath()
      if (state.path) state.filename = basename(state.path)
      state.received = bytes
      state.total = item.getTotalBytes()
      state.status = s === 'interrupted' ? 'interrupted' : item.isPaused() ? 'paused' : 'progressing'
      changed()
    })
    item.once('done', (_ev, s) => {
      live.delete(state.id)
      state.path = item.getSavePath()
      if (state.path) state.filename = basename(state.path)
      state.received = item.getReceivedBytes()
      state.total = item.getTotalBytes() || state.received
      state.status = s
      state.speed = 0
      // A cancelled "save as" dialog has no path; don't keep a ghost entry.
      if (s === 'cancelled' && !state.path) forget((d) => d === state)
      changed(true)
    })
    changed(true)
    broadcast('download:started', state.id)
  })
}

export function downloadAction(id: string, action: string, session: Session): void {
  const state = listDownloads().find((d) => d.id === id)
  const item = live.get(id)?.item
  switch (action) {
    case 'open':
      if (state?.status === 'completed') void shell.openPath(state.path)
      break
    case 'show':
      if (state?.path && existsSync(state.path)) shell.showItemInFolder(state.path)
      else if (state?.path) void shell.openPath(join(state.path, '..'))
      break
    case 'pause':
      item?.pause()
      break
    case 'resume':
      if (item?.canResume()) item.resume()
      break
    case 'cancel':
      item?.cancel()
      break
    case 'retry':
      if (state) {
        forget((d) => d === state)
        session.downloadURL(state.url)
      }
      break
    case 'remove':
      item?.cancel()
      forget((d) => d.id === id)
      break
  }
  changed(true)
}

export function clearDownloads(): void {
  forget((d) => !live.has(d.id))
  changed(true)
}

function uniquePath(dir: string, filename: string): string {
  const safe = filename.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_') || 'download'
  const ext = extname(safe)
  const stem = safe.slice(0, safe.length - ext.length)
  let candidate = join(dir, safe)
  for (let n = 1; existsSync(candidate); n++) candidate = join(dir, `${stem} (${n})${ext}`)
  return candidate
}
