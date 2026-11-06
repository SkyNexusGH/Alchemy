import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateState } from '@shared/types'
import { broadcast } from './broadcast'

/**
 * Updates in place from GitHub Releases: new versions download quietly in the
 * background (only the changed blocks, thanks to differential updates) and are
 * applied on the next restart — or right away from the "Update" button.
 */

const CHECK_EVERY = 3600_000
/** Coming back to Alchemy checks again if the last check is older than this. */
const RECHECK_ON_FOCUS = 15 * 60_000
let lastCheck = 0
let state: UpdateState = { status: app.isPackaged ? 'idle' : 'disabled' }

function set(next: UpdateState): void {
  state = next
  broadcast('update', state)
}

export function updateState(): UpdateState {
  return state
}

export function initUpdater(onReady: () => void): void {
  if (!app.isPackaged) return
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    if (state.status !== 'ready') set({ status: 'checking' })
  })
  autoUpdater.on('update-not-available', () => set({ status: 'latest' }))
  autoUpdater.on('update-available', (info) => set({ status: 'downloading', version: info.version, percent: 0 }))
  autoUpdater.on('download-progress', (p) => set({ ...state, status: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (info) => {
    set({ status: 'ready', version: info.version })
    onReady()
  })
  autoUpdater.on('error', (err) => {
    // Being offline isn't worth bothering anyone about; the next check retries.
    if (state.status !== 'ready') set({ status: 'error', error: err?.message ?? String(err) })
  })

  // Give startup a head start before touching the network.
  setTimeout(() => void checkForUpdates(), 15_000)
  setInterval(() => void checkForUpdates(), CHECK_EVERY)
  // A release published while Alchemy is open is found the next time you come back to it,
  // instead of hours later.
  app.on('browser-window-focus', () => {
    if (Date.now() - lastCheck > RECHECK_ON_FOCUS) void checkForUpdates()
  })
}

export async function checkForUpdates(): Promise<void> {
  if (!app.isPackaged || state.status === 'downloading' || state.status === 'ready') return
  lastCheck = Date.now()
  try {
    await autoUpdater.checkForUpdates()
  } catch {
    /* reported through the 'error' event */
  }
}

/** Restarts into the downloaded version. Tabs come back via session restore. */
export function installUpdate(): void {
  if (state.status === 'ready') autoUpdater.quitAndInstall(true, true)
}
