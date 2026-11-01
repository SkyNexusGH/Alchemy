import { adsAndTrackingLists, ElectronBlocker, fullLists } from '@ghostery/adblocker-electron'
import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { FilterStatus } from '@shared/types'
import { broadcast } from '../broadcast'
import { getSettings, onSettingsChanged } from '../settings'

// The same lists uBlock Origin uses by default (EasyList, EasyPrivacy, Peter Lowe,
// uBO filters/badware/privacy/unbreak), mirrored by the Ghostery adblocker project.
// Cookie-banner lists are added when "Hide cookie banners" is on.
const REFRESH_MS = 24 * 3600_000
const CONFIG = {
  loadCosmeticFilters: true,
  loadNetworkFilters: true,
  enableCompression: true,
  enableMutationObserver: true,
  guessRequestTypeFromUrl: false
}

let blocker: ElectronBlocker | null = null
const status: FilterStatus = { ready: false, lists: 0, updated: null, updating: false, error: null }

function lists(): string[] {
  return getSettings().blockCookieBanners ? fullLists : adsAndTrackingLists
}

function cachePath(): string {
  return join(app.getPath('userData'), `filters-${getSettings().blockCookieBanners ? 'full' : 'standard'}.bin`)
}

const metaPath = (): string => `${cachePath()}.json`

export function getBlocker(): ElectronBlocker | null {
  return blocker
}

export function filterStatus(): FilterStatus {
  return status
}

function changed(): void {
  broadcast('filters', status)
}

/** Loads the cached engine immediately (if any), then refreshes stale lists in the background. */
export async function initFilters(): Promise<void> {
  const loaded = await loadCache()
  const updated = status.updated ?? 0
  if (!loaded || Date.now() - updated > REFRESH_MS) void updateFilters()
  setInterval(() => void updateFilters(), REFRESH_MS)

  let cookieBanners = getSettings().blockCookieBanners
  onSettingsChanged((s) => {
    if (s.blockCookieBanners === cookieBanners) return
    cookieBanners = s.blockCookieBanners
    void loadCache().then((ok) => {
      if (!ok) void updateFilters()
    })
  })
}

async function loadCache(): Promise<boolean> {
  try {
    if (!existsSync(cachePath())) return false
    const engine = ElectronBlocker.deserialize(new Uint8Array(await readFile(cachePath())))
    const meta = existsSync(metaPath()) ? JSON.parse(readFileSync(metaPath(), 'utf8')) : {}
    blocker = engine
    Object.assign(status, { ready: true, lists: lists().length, updated: meta.updated ?? null, error: null })
    changed()
    return true
  } catch (err) {
    // A cache from an older engine version can't be read; rebuild it.
    console.warn('[adblock] cache unreadable, rebuilding', err)
    return false
  }
}

export async function updateFilters(): Promise<void> {
  if (status.updating) return
  status.updating = true
  changed()
  try {
    const urls = lists()
    const engine = await ElectronBlocker.fromLists(fetch, urls, CONFIG)
    blocker = engine
    writeFileSync(cachePath(), engine.serialize())
    const updated = Date.now()
    writeFileSync(metaPath(), JSON.stringify({ updated, lists: urls.length }))
    Object.assign(status, { ready: true, lists: urls.length, updated, error: null })
  } catch (err) {
    status.error = err instanceof Error ? err.message : String(err)
    console.error('[adblock] filter update failed', err)
  } finally {
    status.updating = false
    changed()
  }
}
