import { Request } from '@ghostery/adblocker-electron'
import { ipcMain, webContents, type Session } from 'electron'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { getHostname, parse } from 'tldts-experimental'
import { getSettings } from '../settings'
import { getBlocker, isDangerous, isTracker, levelFor } from './engine'
import { countBlocked, shieldsEnabled, siteOf, siteProtected } from './shields'

// Ghostery's cosmetic-filter preload hides ad placeholders and runs uBO scriptlets in every frame.
const COSMETIC_PRELOAD = require.resolve('@ghostery/adblocker-electron-preload')
// Fingerprinting protection and the video popout button, in every frame.
const FRAME_PRELOAD = join(__dirname, '../preload/frame.js')

type BlockedListener = (webContentsId: number, url: string, tracker: boolean) => void
const blockedListeners = new Set<BlockedListener>()

const clipboardListeners = new Set<(webContentsId: number) => void>()
export function onClipboardBlocked(fn: (webContentsId: number) => void): void {
  clipboardListeners.add(fn)
}

export function onRequestBlocked(fn: BlockedListener): void {
  blockedListeners.add(fn)
}

// ---- HTTPS upgrade ----------------------------------------------------------------
// Like Chrome's HTTPS-First mode: try https:// first, fall back to http:// if the site
// can't do it, and remember that for the rest of the session.

const httpOnly = new Set<string>()
/** https URL we redirected to → the original http URL. */
const upgraded = new Map<string, string>()

function upgradable(host: string): boolean {
  if (!host.includes('.') || /^[\d.]+$/.test(host) || host.startsWith('[')) return false
  return !/\.(local|lan|internal|home|test|localhost|arpa)$/.test(host) && !httpOnly.has(host)
}

/** If an upgraded load failed, returns the http:// URL to retry with. */
export function httpsFallback(failedUrl: string, code: number): string | null {
  const original = upgraded.get(failedUrl)
  // Connection (-1xx), certificate (-2xx) and HTTP (-3xx, e.g. empty response) errors
  // mean the site has no working HTTPS. -105 (name not resolved) would fail on http too.
  if (!original || code > -100 || code <= -400 || code === -105) return null
  upgraded.delete(failedUrl)
  httpOnly.add(getHostname(original) ?? '')
  return original
}

export function navigationCommitted(url: string): void {
  upgraded.delete(url)
}

// ---- per-request decisions ----------------------------------------------------------

function topUrl(webContentsId: number | undefined): string | null {
  if (!webContentsId) return null
  const wc = webContents.fromId(webContentsId)
  return wc && !wc.isDestroyed() ? wc.getURL() : null
}

function isThirdParty(url: string, top: string | null): boolean {
  return !!top && /^https?:/.test(top) && siteOf(url) !== siteOf(top)
}

// ---- which sessions are which -------------------------------------------------------

/** Masked Mode and Tor sessions: Aegis runs at Extreme there (#428). */
const maskedSessions = new WeakSet<Session>()
/** The sidebar sites' session, which has its own switch (#419). */
const panelSessions = new WeakSet<Session>()

export const isMaskedSession = (s: Session | undefined): boolean => !!s && maskedSessions.has(s)

/** Whether Aegis blocks in this session at all. */
function blocksIn(session: Session | undefined): boolean {
  return !(session && panelSessions.has(session) && getSettings().aegisPanels === false)
}

const levelOf = (session: Session | undefined, top: string | null): ReturnType<typeof levelFor> => levelFor(top, isMaskedSession(session))

// ---- known dangerous pages (#421) -----------------------------------------------------

/** Sites you chose to open anyway this session. */
const allowedDanger = new Set<string>()

export function allowDangerousSite(url: string): void {
  allowedDanger.add(siteOf(url))
}

/** A page on the malware or phishing lists goes to a warning instead. */
function dangerousPage(url: string, session: Session | undefined): boolean {
  if (!/^https?:/.test(url) || allowedDanger.has(siteOf(url)) || !getSettings().adblock || !blocksIn(session)) return false
  return isDangerous(url)
}

function onBeforeRequest(
  session: Session | undefined,
  details: Electron.OnBeforeRequestListenerDetails,
  callback: (response: Electron.CallbackResponse) => void
): void {
  const { url, resourceType, webContentsId } = details

  if (resourceType === 'mainFrame') {
    if (dangerousPage(url, session)) return callback({ redirectURL: `alchemy://error/?c=danger&u=${encodeURIComponent(url)}` })
    if (getSettings().httpsUpgrade && url.startsWith('http://') && siteProtected(url)) {
      const host = getHostname(url) ?? ''
      if (upgradable(host)) {
        const https = `https://${url.slice(7)}`
        upgraded.set(https, url)
        if (upgraded.size > 500) upgraded.delete(upgraded.keys().next().value!)
        return callback({ redirectURL: https })
      }
    }
    return callback({})
  }

  const top = topUrl(webContentsId) ?? details.referrer
  if (!top || !shieldsEnabled(top) || !blocksIn(session)) return callback({})
  const blocker = getBlocker(levelOf(session, top))
  if (!blocker) return callback({})

  const request = Request.fromRawDetails({
    requestId: `${details.id}`,
    url,
    sourceUrl: details.referrer || top,
    tabId: webContentsId,
    type: (resourceType || 'other') as Parameters<typeof Request.fromRawDetails>[0]['type']
  })
  const { redirect, match } = blocker.match(request)
  if (!redirect && !match) return callback({})
  const tracker = getSettings().splitBlockCounts ? isTracker(request) : null

  // Some filters swap a script for a harmless stub instead of blocking, so pages don't break.
  if (redirect) {
    reportBlocked(webContentsId, url, tracker)
    return callback({ redirectURL: redirect.dataUrl })
  }
  // Ad scripts sometimes retry a failed request in a tight loop (thousands per second).
  // Once that happens, answer with an empty success so the loop stops burning CPU.
  if (isRetryStorm(webContentsId, url)) return callback({ redirectURL: noopFor(resourceType) })
  reportBlocked(webContentsId, url, tracker)
  callback({ cancel: true })
}

function reportBlocked(webContentsId: number | undefined, url: string, tracker: boolean | null): void {
  countBlocked(tracker, url, topUrl(webContentsId))
  if (webContentsId) for (const fn of blockedListeners) fn(webContentsId, url, tracker === true)
}

const recentBlocks = new Map<string, { count: number; last: number }>()

/** True once a URL is blocked 20+ times without a 2-second pause, and for as long as it keeps coming. */
function isRetryStorm(webContentsId: number | undefined, url: string): boolean {
  const key = `${webContentsId}|${url}`
  const now = Date.now()
  const entry = recentBlocks.get(key)
  if (!entry || now - entry.last > 2000) {
    recentBlocks.set(key, { count: 1, last: now })
    if (recentBlocks.size > 2000) recentBlocks.delete(recentBlocks.keys().next().value!)
    return false
  }
  entry.count++
  entry.last = now
  return entry.count > 20
}

function noopFor(type: string): string {
  if (type === 'xhr' || type === 'fetch') return 'data:application/json,{}'
  if (type === 'script') return 'data:text/javascript,'
  if (type === 'image') return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
  if (type === 'stylesheet') return 'data:text/css,'
  return 'data:text/plain,'
}

function onBeforeSendHeaders(
  details: Electron.OnBeforeSendHeadersListenerDetails,
  callback: (response: Electron.BeforeSendResponse) => void
): void {
  const settings = getSettings()
  const headers = details.requestHeaders
  const top = details.resourceType === 'mainFrame' ? details.url : topUrl(details.webContentsId)
  if (top && !siteProtected(top)) return callback({ requestHeaders: headers })

  if (settings.sendGpc) headers['Sec-GPC'] = '1'
  if (settings.sendDnt) headers.DNT = '1'
  if (settings.blockThirdPartyCookies && details.resourceType !== 'mainFrame' && isThirdParty(details.url, top)) {
    for (const name of Object.keys(headers)) if (name.toLowerCase() === 'cookie') delete headers[name]
  }
  callback({ requestHeaders: headers })
}

function onHeadersReceived(
  session: Session | undefined,
  details: Electron.OnHeadersReceivedListenerDetails,
  callback: (response: Electron.HeadersReceivedResponse) => void
): void {
  const headers = details.responseHeaders ?? {}
  const isFrame = details.resourceType === 'mainFrame' || details.resourceType === 'subFrame'
  const top = details.resourceType === 'mainFrame' ? details.url : topUrl(details.webContentsId)
  let changed = false

  // Filters can add a Content-Security-Policy (e.g. to stop a page's inline miners or popups).
  const blocker = top && blocksIn(session) ? getBlocker(levelOf(session, top)) : null
  if (blocker && isFrame && top && shieldsEnabled(top)) {
    const csp = blocker.getCSPDirectives(
      Request.fromRawDetails({
        requestId: `${details.id}`,
        url: details.url,
        sourceUrl: details.referrer,
        type: details.resourceType as 'mainFrame' | 'subFrame'
      })
    )
    if (csp) {
      const policies = [csp]
      for (const [name, values] of Object.entries(headers)) {
        if (name.toLowerCase() !== 'content-security-policy') continue
        policies.push(...values)
        delete headers[name]
      }
      headers['Content-Security-Policy'] = [policies.join(';')]
      changed = true
    }
  }

  if (
    getSettings().blockThirdPartyCookies &&
    details.resourceType !== 'mainFrame' &&
    isThirdParty(details.url, top) &&
    top &&
    siteProtected(top)
  ) {
    for (const name of Object.keys(headers)) {
      if (name.toLowerCase() !== 'set-cookie') continue
      delete headers[name]
      changed = true
    }
  }

  callback(changed ? { responseHeaders: headers } : {})
}

// ---- wiring -----------------------------------------------------------------------

/** Per-run secret so fingerprint noise differs per site and per session. */
const sessionKey = randomBytes(4).readUInt32LE(0)

function seedFor(url: string): number {
  let h = sessionKey
  for (const c of siteOf(url)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0
  return h
}

export function protectSession(session: Session, opts: { masked?: boolean; panels?: boolean } = {}): void {
  if (opts.masked) maskedSessions.add(session)
  if (opts.panels) panelSessions.add(session)
  session.registerPreloadScript({ type: 'frame', filePath: COSMETIC_PRELOAD })
  session.registerPreloadScript({ type: 'frame', filePath: FRAME_PRELOAD })
  session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (d, cb) => onBeforeRequest(session, d, cb))
  session.webRequest.onBeforeSendHeaders({ urls: ['<all_urls>'] }, onBeforeSendHeaders)
  session.webRequest.onHeadersReceived({ urls: ['<all_urls>'] }, (d, cb) => onHeadersReceived(session, d, cb))
}

export function registerPrivacyIpc(): void {
  // Element hiding (styles) arrives here once the page has loaded. Scriptlets are NOT
  // injected here: they already ran at document start via 'alchemy:frame' below, which is
  // the only way they can beat sites like YouTube that read their data immediately.
  ipcMain.handle('@ghostery/adblocker/inject-cosmetic-filters', (event, url: string, msg) => {
    const top = event.sender.getURL() || url
    const blocker = blocksIn(event.sender.session) ? getBlocker(levelOf(event.sender.session, top)) : null
    if (!blocker || !shieldsEnabled(top)) return
    const { hostname, domain } = parse(url)
    const firstRun = msg === undefined
    const { active, styles } = blocker.getCosmeticsFilters({
      url,
      hostname: hostname ?? '',
      domain: domain ?? '',
      classes: msg?.classes,
      hrefs: msg?.hrefs,
      ids: msg?.ids,
      getBaseRules: firstRun,
      getInjectionRules: false,
      getExtendedRules: false,
      getRulesFromHostname: firstRun,
      getRulesFromDOM: !firstRun,
      callerContext: { frameId: event.frameId, processId: event.processId, lifecycle: msg?.lifecycle }
    })
    if (active !== false && styles.length) void event.sender.insertCSS(styles, { cssOrigin: 'user' })
  })
  ipcMain.handle('@ghostery/adblocker/is-mutation-observer-enabled', (event) => {
    const blocker = blocksIn(event.sender.session) ? getBlocker(levelOf(event.sender.session, event.sender.getURL())) : null
    return !!blocker && shieldsEnabled(event.sender.getURL()) && blocker.config.enableMutationObserver
  })
  // Asked synchronously by every frame before page scripts run.
  // A page tried to change the clipboard behind your back; tell whoever's looking at it.
  ipcMain.on('alchemy:clipboard-blocked', (event) => {
    for (const fn of clipboardListeners) fn(event.sender.id)
  })
  ipcMain.on('alchemy:frame', (event, frameUrl: string) => {
    // While a new page starts, the tab still reports the old address; its own frame knows better.
    const top = event.senderFrame === event.sender.mainFrame && frameUrl ? frameUrl : event.sender.getURL()
    const settings = getSettings()
    const on = /^https?:/.test(top) && siteProtected(top)
    // #447 Fingerprint protection can be off for one site that breaks with it.
    const farble = on && settings.fingerprintProtection && !(settings.fingerprintOff ?? []).includes(siteOf(top))
    event.returnValue = {
      farble,
      gpc: on && settings.sendGpc,
      seed: seedFor(top),
      clipboard: on && settings.pasteProtection,
      profile: farble && settings.fingerprintProfiles,
      popout: settings.videoPopout,
      scriptlets: blocksIn(event.sender.session) ? scriptletsFor(frameUrl || top, top, levelOf(event.sender.session, top)) : []
    }
  })
}

/**
 * uBlock-style scriptlets for a frame (e.g. YouTube's ad-stripping json-prune rules).
 * They must run before the page's own scripts, so the frame asks for them synchronously.
 */
function scriptletsFor(url: string, top: string, level: ReturnType<typeof levelFor>): string[] {
  const blocker = getBlocker(level)
  if (!blocker || !/^https?:/.test(url) || !shieldsEnabled(top)) return []
  const { hostname, domain } = parse(url)
  const { active, scripts } = blocker.getCosmeticsFilters({
    url,
    hostname: hostname ?? '',
    domain: domain ?? '',
    getBaseRules: false,
    getInjectionRules: true,
    getExtendedRules: false,
    getRulesFromHostname: true,
    getRulesFromDOM: false
  })
  return active === false ? [] : scripts
}
