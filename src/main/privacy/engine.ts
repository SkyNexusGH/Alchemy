import { adsAndTrackingLists, ElectronBlocker, fullLists, Request } from '@ghostery/adblocker-electron'
import { app } from 'electron'
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { FilterStatus } from '@shared/types'
import { broadcast } from '../broadcast'
import { getSettings, onSettingsChanged } from '../settings'
import { siteOf } from './shields'

// The same lists uBlock Origin uses by default (EasyList, EasyPrivacy, Peter Lowe,
// uBO filters/badware/privacy/unbreak), mirrored by the Ghostery adblocker project.
// Comfort adds the cookie-banner lists; Extreme adds uBlock's other annoyance lists too.
const REFRESH_MS = 24 * 3600_000
// Crypto miners that run in pages and use your CPU (the NoCoin list), on top of uBlock's own.
const MINER_LIST = 'https://raw.githubusercontent.com/hoshsadiq/adblock-nocoin-list/master/nocoin.txt'
// Bumped when the set of lists changes, so caches built from the old set are refreshed.
const LISTS_VERSION = 3
const CONFIG = {
  loadCosmeticFilters: true,
  loadNetworkFilters: true,
  enableCompression: true,
  enableMutationObserver: true,
  guessRequestTypeFromUrl: false
}

export type Level = 'chill' | 'comfort' | 'extreme'

/** One engine per level that's in use: the global one, plus Extreme for Masked Mode and any site set apart. */
const engines = new Map<Level, ElectronBlocker>()
const loading = new Set<Level>()
const status: FilterStatus = { ready: false, lists: 0, updated: null, updating: false, error: null }

/** Known malware and phishing pages (URLhaus and Phishing Army, as uBlock offers). Used at every level. */
const SAFETY_LISTS = ['https://malware-filter.gitlab.io/malware-filter/urlhaus-filter-online.txt', 'https://malware-filter.gitlab.io/malware-filter/phishing-filter.txt']

/** Alchemy's own small rules: the "Sign in with Google" pop-up some sites show (#402). It only hides it; sign-in buttons still work. */
const ALCHEMY_RULES = ['###credential_picker_container', '###credential_picker_iframe', '##iframe[src*="accounts.google.com/gsi/iframe/select"]'].join('\n')
const ALCHEMY_LIST = `data:text/plain;charset=utf-8,${encodeURIComponent(ALCHEMY_RULES)}`

/** The level set in Settings. */
export function globalLevel(): Level {
  const level = getSettings().aegisLevel
  return level === 'chill' || level === 'extreme' ? level : 'comfort'
}

/** #396 #428 The level for a page: Masked Mode is always Extreme; a site can have its own. */
export function levelFor(top: string | null, masked = false): Level {
  if (masked) return 'extreme'
  if (top) {
    const own = getSettings().aegisSiteLevels?.[siteOf(top)]
    if (own === 'chill' || own === 'comfort' || own === 'extreme') return own
  }
  return globalLevel()
}

function lists(level: Level): string[] {
  // Chill: ads only (EasyList and uBlock's own filters), so sites behave most normally.
  const base =
    level === 'chill'
      ? adsAndTrackingLists.filter((u) => !/easyprivacy|ublock-origin\/privacy|peter-lowe/.test(u))
      : level === 'comfort'
        ? [...adsAndTrackingLists, ...fullLists.filter((u) => /cookie/.test(u) && !adsAndTrackingLists.includes(u)), MINER_LIST]
        : [...fullLists, MINER_LIST]
  return [...base, ...SAFETY_LISTS, ALCHEMY_LIST]
}

const cachePath = (level: Level): string => join(app.getPath('userData'), `filters-${level}.bin`)
const metaPath = (level: Level): string => `${cachePath(level)}.json`

/** The engine for a level; while it's still loading, the global one stands in. */
export function getBlocker(level: Level = globalLevel()): ElectronBlocker | null {
  const engine = engines.get(level)
  if (engine) return engine
  if (!loading.has(level) && status.ready) void ensureEngine(level)
  return engines.get(globalLevel()) ?? null
}

// ---- known dangerous pages (#421): only the malware and phishing lists, not ad or tracker lists ----

let dangerEngine: ElectronBlocker | null = null
const dangerCache = (): string => join(app.getPath('userData'), 'filters-danger.bin')

async function loadDanger(refresh = false): Promise<void> {
  try {
    if (!refresh && existsSync(dangerCache())) {
      dangerEngine = ElectronBlocker.deserialize(new Uint8Array(await readFile(dangerCache())))
      if (Date.now() - statSync(dangerCache()).mtimeMs < REFRESH_MS) return
    }
    const engine = await ElectronBlocker.fromLists(fetch, SAFETY_LISTS, { ...CONFIG, loadCosmeticFilters: false })
    dangerEngine = engine
    writeFileSync(dangerCache(), engine.serialize())
  } catch (err) {
    console.warn('[adblock] malware lists unavailable', err)
  }
}

/** Whether a page is on the malware or phishing lists. */
export function isDangerous(url: string): boolean {
  if (!dangerEngine) return false
  const { match } = dangerEngine.match(Request.fromRawDetails({ url, sourceUrl: url, type: 'mainFrame' }))
  return match
}

async function ensureEngine(level: Level): Promise<void> {
  if (engines.has(level) || loading.has(level)) return
  loading.add(level)
  try {
    if (!(await loadCache(level))) await buildEngine(level)
  } finally {
    loading.delete(level)
  }
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

  // Caches named after the old levels ("full", "standard") aren't used any more.
  for (const old of ['full', 'standard']) for (const f of [`filters-${old}.bin`, `filters-${old}.bin.json`]) rmSync(join(app.getPath('userData'), f), { force: true })
  void loadDanger()
  setInterval(() => void loadDanger(true), REFRESH_MS)
  const loaded = await loadCache(globalLevel())
  const updated = status.updated ?? 0
  if (!loaded || Date.now() - updated > REFRESH_MS) void updateFilters()
  setInterval(() => void updateFilters(), REFRESH_MS)

  // A new level means a different set of lists.
  let key = globalLevel()
  onSettingsChanged(() => {
    if (globalLevel() === key) return
    key = globalLevel()
    if (!engines.has(key)) void ensureEngine(key)
  })
}

async function loadCache(level: Level): Promise<boolean> {
  try {
    if (!existsSync(cachePath(level))) return false
    const engine = ElectronBlocker.deserialize(new Uint8Array(await readFile(cachePath(level))))
    const meta = existsSync(metaPath(level)) ? JSON.parse(readFileSync(metaPath(level), 'utf8')) : {}
    engines.set(level, engine)
    if (level === globalLevel()) {
      // A cache built from an older set of lists is used for now and refreshed right away.
      const current = meta.version === LISTS_VERSION
      Object.assign(status, { ready: true, lists: lists(level).length, updated: current ? (meta.updated ?? null) : null, error: null })
      changed()
    }
    return true
  } catch (err) {
    // A cache from an older engine version can't be read; rebuild it.
    console.warn('[adblock] cache unreadable, rebuilding', err)
    return false
  }
}

async function buildEngine(level: Level): Promise<void> {
  const urls = lists(level)
  const engine = await ElectronBlocker.fromLists(fetch, urls, CONFIG)
  engines.set(level, engine)
  writeFileSync(cachePath(level), engine.serialize())
  writeFileSync(metaPath(level), JSON.stringify({ updated: Date.now(), lists: urls.length, version: LISTS_VERSION }))
}

export async function updateFilters(): Promise<void> {
  if (status.updating) return
  status.updating = true
  changed()
  try {
    // The global level first, then any other level in use.
    const levels = [globalLevel(), ...[...engines.keys()].filter((l) => l !== globalLevel())]
    for (const level of levels) await buildEngine(level)
    Object.assign(status, { ready: true, lists: lists(globalLevel()).length, updated: Date.now(), error: null })
  } catch (err) {
    status.error = err instanceof Error ? err.message : String(err)
    console.error('[adblock] filter update failed', err)
  } finally {
    status.updating = false
    changed()
  }
}
