import { adsAndTrackingLists, ElectronBlocker, fullLists, type Request } from '@ghostery/adblocker-electron'
import { app } from 'electron'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { FilterStatus } from '@shared/types'
import { broadcast } from '../broadcast'
import { getSettings, onSettingsChanged } from '../settings'

// The same lists uBlock Origin uses by default (EasyList, EasyPrivacy, Peter Lowe,
// uBO filters/badware/privacy/unbreak), mirrored by the Ghostery adblocker project.
// Cookie-banner lists are added when "Hide cookie banners" is on.
const REFRESH_MS = 24 * 3600_000
// Crypto miners that run in pages and use your CPU (the NoCoin list), on top of uBlock's own.
const MINER_LIST = 'https://raw.githubusercontent.com/hoshsadiq/adblock-nocoin-list/master/nocoin.txt'
// Bumped when the set of lists changes, so caches built from the old set are refreshed.
const LISTS_VERSION = 2
const CONFIG = {
  loadCosmeticFilters: true,
  loadNetworkFilters: true,
  enableCompression: true,
  enableMutationObserver: true,
  guessRequestTypeFromUrl: false
}

let blocker: ElectronBlocker | null = null
const status: FilterStatus = { ready: false, lists: 0, updated: null, updating: false, error: null }

/** Which lists each protection level uses. */
function levelKey(): 'chill' | 'standard' | 'full' {
  const s = getSettings()
  if (s.aegisLevel === 'extreme') return 'full'
  if (s.aegisLevel === 'chill') return 'chill'
  return s.blockCookieBanners ? 'full' : 'standard'
}

function lists(): string[] {
  const key = levelKey()
  // Chill: ads only (EasyList and uBlock's own filters), so sites behave most normally.
  if (key === 'chill') return adsAndTrackingLists.filter((u) => !/easyprivacy|ublock-origin\/privacy|peter-lowe/.test(u))
  return [...(key === 'full' ? fullLists : adsAndTrackingLists), MINER_LIST]
}

function cachePath(): string {
  return join(app.getPath('userData'), `filters-${levelKey()}.bin`)
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

// ---- telling trackers from ads -------------------------------------------------------
// Everything is blocked by the one engine above. To count ads and trackers separately,
// a second, small engine holds only EasyList, the ads list: a blocked request it matches
// is an ad, and anything else blocked (EasyPrivacy, uBlock's privacy list, …) is a tracker.
// Ads win ties, because the tracker lists also name many ad servers.

const ADS_LISTS = adsAndTrackingLists.filter((u) => /easylist\/easylist\.txt$/.test(u))
let trackerEngine: ElectronBlocker | null = null
let trackerLoading = false

const trackerCache = (): string => join(app.getPath('userData'), 'filters-ads-only.bin')

/** True when a blocked request isn't on the ads list. Counted as an ad until that list is loaded. */
export function isTracker(request: Request): boolean {
  if (!trackerEngine) return false
  const { match, redirect } = trackerEngine.match(request)
  return !(match || redirect)
}

async function loadTrackerEngine(refresh = false): Promise<void> {
  if (trackerLoading || (trackerEngine && !refresh)) return
  trackerLoading = true
  try {
    const fresh = existsSync(trackerCache()) && Date.now() - statSync(trackerCache()).mtimeMs < REFRESH_MS
    if (!refresh && existsSync(trackerCache())) {
      trackerEngine = ElectronBlocker.deserialize(new Uint8Array(await readFile(trackerCache())))
      if (fresh) return
    }
    const engine = await ElectronBlocker.fromLists(fetch, ADS_LISTS, { ...CONFIG, loadCosmeticFilters: false })
    trackerEngine = engine
    writeFileSync(trackerCache(), engine.serialize())
  } catch (err) {
    console.warn('[adblock] tracker lists unavailable', err)
  } finally {
    trackerLoading = false
  }
}

/** Loads the cached engine immediately (if any), then refreshes stale lists in the background. */
export async function initFilters(): Promise<void> {
  if (getSettings().splitBlockCounts) void loadTrackerEngine()
  onSettingsChanged((s) => {
    if (s.splitBlockCounts) void loadTrackerEngine()
    else trackerEngine = null
  })
  setInterval(() => getSettings().splitBlockCounts && void loadTrackerEngine(true), REFRESH_MS)

  const loaded = await loadCache()
  const updated = status.updated ?? 0
  if (!loaded || Date.now() - updated > REFRESH_MS) void updateFilters()
  setInterval(() => void updateFilters(), REFRESH_MS)

  // A new level (or the cookie banner switch) means a different set of lists.
  let key = levelKey()
  onSettingsChanged(() => {
    if (levelKey() === key) return
    key = levelKey()
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
    // A cache built from an older set of lists is used for now and refreshed right away.
    const current = meta.version === LISTS_VERSION
    Object.assign(status, { ready: true, lists: lists().length, updated: current ? (meta.updated ?? null) : null, error: null })
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
    writeFileSync(metaPath(), JSON.stringify({ updated, lists: urls.length, version: LISTS_VERSION }))
    Object.assign(status, { ready: true, lists: urls.length, updated, error: null })
  } catch (err) {
    status.error = err instanceof Error ? err.message : String(err)
    console.error('[adblock] filter update failed', err)
  } finally {
    status.updating = false
    changed()
  }
}
