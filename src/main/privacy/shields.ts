import { getDomain, getHostname } from 'tldts-experimental'
import { broadcast } from '../broadcast'
import { getSettings } from '../settings'
import { JsonStore } from '../store'

/** Sites (registrable domains) where the user turned protections off. */
const exceptions = new JsonStore<{ sites: string[] }>('shields', { sites: [] })
const stats = new JsonStore<{ blocked: number; since: number; ads?: number; trackers?: number }>(
  'stats',
  { blocked: 0, since: Date.now() },
  5000
)

/** "www.news.example.co.uk" → "example.co.uk". Shields apply to a whole site. */
export function siteOf(url: string): string {
  const host = getHostname(url) ?? ''
  return getDomain(url) ?? host
}

export function shieldsEnabled(url: string): boolean {
  if (!getSettings().adblock || !/^https?:/.test(url)) return false
  return !exceptions.data.sites.includes(siteOf(url))
}

/** Like shieldsEnabled, but ignores the global ad-block switch (for cookies, HTTPS, fingerprinting). */
export function siteProtected(url: string): boolean {
  return !exceptions.data.sites.includes(siteOf(url))
}

export function setSiteShields(site: string, enabled: boolean): void {
  const rest = exceptions.data.sites.filter((s) => s !== site)
  exceptions.data.sites = enabled ? rest : [...rest, site]
  exceptions.save()
  broadcast('shields:exceptions', exceptions.data.sites)
}

export function shieldExceptions(): string[] {
  return exceptions.data.sites
}

/** `tracker` is null when ads and trackers aren't being told apart. */
export function countBlocked(tracker: boolean | null): void {
  stats.data.blocked++
  if (tracker === true) stats.data.trackers = (stats.data.trackers ?? 0) + 1
  if (tracker === false) stats.data.ads = (stats.data.ads ?? 0) + 1
  stats.save()
}

export function blockStats(): { blocked: number; since: number; ads: number; trackers: number } {
  return { blocked: stats.data.blocked, since: stats.data.since, ads: stats.data.ads ?? 0, trackers: stats.data.trackers ?? 0 }
}
