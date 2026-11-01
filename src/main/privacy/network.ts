import { Request } from '@ghostery/adblocker-electron'
import { ipcMain, webContents, type Session } from 'electron'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { getHostname, parse } from 'tldts-experimental'
import { getSettings } from '../settings'
import { getBlocker } from './engine'
import { countBlocked, shieldsEnabled, siteOf, siteProtected } from './shields'

// Ghostery's cosmetic-filter preload hides ad placeholders and runs uBO scriptlets in every frame.
const COSMETIC_PRELOAD = require.resolve('@ghostery/adblocker-electron-preload')
// Fingerprinting protection and the video popout button, in every frame.
const FRAME_PRELOAD = join(__dirname, '../preload/frame.js')

type BlockedListener = (webContentsId: number, url: string) => void
const blockedListeners = new Set<BlockedListener>()

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

function onBeforeRequest(
  details: Electron.OnBeforeRequestListenerDetails,
  callback: (response: Electron.CallbackResponse) => void
): void {
  const { url, resourceType, webContentsId } = details

  if (resourceType === 'mainFrame') {
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

  const blocker = getBlocker()
  const top = topUrl(webContentsId) ?? details.referrer
  if (!blocker || !top || !shieldsEnabled(top)) return callback({})

  const request = Request.fromRawDetails({
    requestId: `${details.id}`,
    url,
    sourceUrl: details.referrer || top,
    tabId: webContentsId,
    type: (resourceType || 'other') as Parameters<typeof Request.fromRawDetails>[0]['type']
  })
  const { redirect, match } = blocker.match(request)
  if (!redirect && !match) return callback({})

  // Some filters swap a script for a harmless stub instead of blocking, so pages don't break.
  if (redirect) {
    reportBlocked(webContentsId, url)
    return callback({ redirectURL: redirect.dataUrl })
  }
  // Ad scripts sometimes retry a failed request in a tight loop (thousands per second).
  // Once that happens, answer with an empty success so the loop stops burning CPU.
  if (isRetryStorm(webContentsId, url)) return callback({ redirectURL: noopFor(resourceType) })
  reportBlocked(webContentsId, url)
  callback({ cancel: true })
}

function reportBlocked(webContentsId: number | undefined, url: string): void {
  countBlocked()
  if (webContentsId) for (const fn of blockedListeners) fn(webContentsId, url)
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
  if (settings.blockThirdPartyCookies && details.resourceType !== 'mainFrame' && isThirdParty(details.url, top)) {
    for (const name of Object.keys(headers)) if (name.toLowerCase() === 'cookie') delete headers[name]
  }
  callback({ requestHeaders: headers })
}

function onHeadersReceived(
  details: Electron.OnHeadersReceivedListenerDetails,
  callback: (response: Electron.HeadersReceivedResponse) => void
): void {
  const headers = details.responseHeaders ?? {}
  const isFrame = details.resourceType === 'mainFrame' || details.resourceType === 'subFrame'
  const top = details.resourceType === 'mainFrame' ? details.url : topUrl(details.webContentsId)
  let changed = false

  // Filters can add a Content-Security-Policy (e.g. to stop a page's inline miners or popups).
  const blocker = getBlocker()
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

export function protectSession(session: Session): void {
  session.registerPreloadScript({ type: 'frame', filePath: COSMETIC_PRELOAD })
  session.registerPreloadScript({ type: 'frame', filePath: FRAME_PRELOAD })
  session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, onBeforeRequest)
  session.webRequest.onBeforeSendHeaders({ urls: ['<all_urls>'] }, onBeforeSendHeaders)
  session.webRequest.onHeadersReceived({ urls: ['<all_urls>'] }, onHeadersReceived)
}

export function registerPrivacyIpc(): void {
  // Element hiding (styles) arrives here once the page has loaded. Scriptlets are NOT
  // injected here: they already ran at document start via 'ovyra:frame' below, which is
  // the only way they can beat sites like YouTube that read their data immediately.
  ipcMain.handle('@ghostery/adblocker/inject-cosmetic-filters', (event, url: string, msg) => {
    const blocker = getBlocker()
    const top = event.sender.getURL() || url
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
    const blocker = getBlocker()
    return !!blocker && shieldsEnabled(event.sender.getURL()) && blocker.config.enableMutationObserver
  })
  // Asked synchronously by every frame before page scripts run.
  ipcMain.on('ovyra:frame', (event, frameUrl: string) => {
    const top = event.sender.getURL()
    const settings = getSettings()
    const on = /^https?:/.test(top) && siteProtected(top)
    event.returnValue = {
      farble: on && settings.fingerprintProtection,
      gpc: on && settings.sendGpc,
      seed: seedFor(top),
      popout: settings.videoPopout,
      scriptlets: scriptletsFor(frameUrl || top, top)
    }
  })
}

/**
 * uBlock-style scriptlets for a frame (e.g. YouTube's ad-stripping json-prune rules).
 * They must run before the page's own scripts, so the frame asks for them synchronously.
 */
function scriptletsFor(url: string, top: string): string[] {
  const blocker = getBlocker()
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
