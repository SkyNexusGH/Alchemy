import { app, session, type Session } from 'electron'
import { clearIncognitoDownloads, trackDownloads } from './downloads'
import { setupPermissions } from './permissions'
import { protectSession } from './privacy/network'
import { serveRendererBundle } from './protocol'

/** Everything a browsing session needs, for the normal profile and private windows alike. */
export function setupBrowsingSession(ses: Session, opts: { incognito: boolean; autoAllow?: string[] }): void {
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
