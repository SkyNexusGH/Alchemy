import { getDomain, getHostname } from 'tldts-experimental'
import { broadcast } from '../broadcast'
import { getSettings } from '../settings'
import { JsonStore } from '../store'

/** Sites (registrable domains) where the user turned protections off. */
const exceptions = new JsonStore<{ sites: string[] }>('shields', { sites: [] })
const stats = new JsonStore<{ blocked: number; since: number }>('stats', { blocked: 0, since: Date.now() }, 5000)

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

export function countBlocked(): void {
  stats.data.blocked++
  stats.save()
}

export function blockStats(): { blocked: number; since: number } {
  return stats.data
}
