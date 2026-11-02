import { app, session, type Session } from 'electron'
import { clearIncognitoDownloads, trackDownloads } from './downloads'
import { setupPermissions } from './permissions'
import { protectSession } from './privacy/network'
import { serveRendererBundle } from './protocol'
import { getSettings, onSettingsChanged } from './settings'

const sessions = new Set<Session>()
let limit = -1

/**
 * The network limiter (Settings → Performance): caps every browsing session's bandwidth,
 * so a game or a call on the same connection keeps its share.
 */
function applyNetworkLimit(ses: Session): void {
  const mbps = getSettings().performance.networkLimitMbps
  if (mbps > 0) {
    const bytes = (mbps * 1_000_000) / 8
    ses.enableNetworkEmulation({ latency: 0, downloadThroughput: bytes, uploadThroughput: bytes })
  } else {
    ses.disableNetworkEmulation()
  }
}

onSettingsChanged((s) => {
  if (s.performance.networkLimitMbps === limit) return
  limit = s.performance.networkLimitMbps
  for (const ses of sessions) applyNetworkLimit(ses)
})

/** Everything a browsing session needs, for the normal profile and private windows alike. */
export function setupBrowsingSession(ses: Session, opts: { incognito: boolean; autoAllow?: string[] }): void {
  sessions.add(ses)
  if (getSettings().performance.networkLimitMbps > 0) applyNetworkLimit(ses)
  ses.setUserAgent(app.userAgentFallback)
  serveRendererBundle(ses)
  setupPermissions(ses, { remember: !opts.incognito, autoAllow: opts.autoAllow })
  trackDownloads(ses, opts)
  protectSession(ses)
}

let privateSession: Session | null = null

/**
 * Private windows share one in-memory session (nothing touches disk). When the last
 * private window closes it's wiped, so the next private window starts clean.
 */
export function getPrivateSession(): Session {
  if (!privateSession) {
    privateSession = session.fromPartition('ovyra-private', { cache: true })
    setupBrowsingSession(privateSession, { incognito: true })
  }
  return privateSession
}

export async function endPrivateBrowsing(): Promise<void> {
  if (!privateSession) return
  const ses = privateSession
  clearIncognitoDownloads()
  await ses.clearStorageData()
  await ses.clearCache()
  await ses.clearAuthCache()
  await ses.clearHostResolverCache()
}
