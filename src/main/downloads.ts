import { app, shell, type DownloadItem, type Session } from 'electron'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
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

/** Downloads being picked up again after a restart: the next will-download for its file is it. */
const resuming = new Map<string, DownloadState>()

/** Files that run code: never opened by themselves, and checked by Defender. */
const RISKY = /\.(exe|msi|msix|appx|bat|cmd|com|ps1|vbs|vbe|js|jse|wsf|wsh|scr|pif|cpl|hta|jar|reg|lnk|dll|zip|7z|rar|iso|img)$/i

/** #1180 Asks Microsoft Defender (built into Windows) to scan a finished file. Nothing is uploaded. */
function scanFile(state: DownloadState): void {
  const defender = join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Windows Defender', 'MpCmdRun.exe')
  if (!existsSync(defender) || !existsSync(state.path)) return
  state.scan = 'scanning'
  changed(true)
  execFile(defender, ['-Scan', '-ScanType', '3', '-File', state.path, '-DisableRemediation'], { windowsHide: true, timeout: 120_000 }, (err) => {
    // 0: nothing found; 2: a threat was found. Anything else: the scan couldn't run.
    const code = err ? ((err as NodeJS.ErrnoException & { code?: number }).code as unknown as number) : 0
    state.scan = code === 0 ? 'clean' : code === 2 ? 'threat' : 'unavailable'
    if (state.scan === 'threat') state.openWhenDone = false
    changed(true)
    if (state.scan === 'clean' && state.openWhenDone) void shell.openPath(state.path)
  })
}

export function trackDownloads(session: Session, opts: { incognito: boolean }): void {
  session.on('will-download', (_e, item) => {
    // Carrying on with a download from before a restart: keep its row.
    const again = resuming.get(item.getSavePath())
    if (again) {
      resuming.delete(item.getSavePath())
      again.status = 'progressing'
      follow(item, again)
      return
    }
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
    follow(item, state)
    broadcast('download:started', state.id)
  })
}

/** Keeps a download's row up to date while it runs. */
function follow(item: DownloadItem, state: DownloadState): void {
  {
    const entry = { item, lastBytes: item.getReceivedBytes(), lastTime: Date.now() }
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
      // Enough to ask the server for the rest, should Alchemy close part-way (not for private windows).
      if (!state.incognito)
        state.resume = { urlChain: item.getURLChain(), mimeType: item.getMimeType(), etag: item.getETag(), lastModified: item.getLastModifiedTime(), startTime: item.getStartTime() }
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
      if (s !== 'interrupted') state.resume = undefined
      // A cancelled "save as" dialog has no path; don't keep a ghost entry.
      if (s === 'cancelled' && !state.path) forget((d) => d === state)
      changed(true)
      if (s !== 'completed') return
      // Files that can run code are checked by Defender first; others open straight away if asked.
      if (RISKY.test(state.path)) scanFile(state)
      else if (state.openWhenDone) void shell.openPath(state.path)
    })
    changed(true)
  }
}

/** Picks up a download that stopped when Alchemy closed, from where it got to (if the server allows). */
function resumeInterrupted(state: DownloadState, session: Session): boolean {
  const r = state.resume
  if (!r || !state.path || !existsSync(state.path)) return false
  const offset = statSync(state.path).size
  if (!offset || (state.total && offset >= state.total)) return false
  resuming.set(state.path, state)
  session.createInterruptedDownload({ path: state.path, urlChain: r.urlChain, mimeType: r.mimeType, offset, length: state.total, lastModified: r.lastModified, eTag: r.etag, startTime: r.startTime })
  // It starts paused; carry on once Electron has it.
  setTimeout(() => {
    const item = live.get(state.id)?.item
    if (item?.canResume()) item.resume()
  }, 300)
  return true
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
      else if (!item && state) resumeInterrupted(state, session)
      break
    case 'openWhenDone':
      // Never automatically for files that run code (they're checked and opened by you).
      if (state && !RISKY.test(state.filename)) state.openWhenDone = !state.openWhenDone
      break
    case 'cancel':
      item?.cancel()
      break
    case 'retry':
      // From where it stopped if possible; otherwise from the start.
      if (state && !resumeInterrupted(state, session)) {
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
