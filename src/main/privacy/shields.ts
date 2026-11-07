import { getDomain, getHostname } from 'tldts-experimental'
import { broadcast } from '../broadcast'
import { getSettings } from '../settings'
import type { AegisStats } from '@shared/types'
import { JsonStore } from '../store'
import { companyOf } from './companies'

/** Sites (registrable domains) where the user turned protections off. */
const exceptions = new JsonStore<{ sites: string[] }>('shields', { sites: [] })
const stats = new JsonStore<{
  blocked: number
  since: number
  ads?: number
  trackers?: number
  days?: Record<string, number>
  sites?: Record<string, number>
  companies?: Record<string, number>
}>(
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

/** Round numbers worth a little celebration. */
const MILESTONES = [1_000, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 5_000_000]
const milestoneListeners = new Set<(n: number) => void>()
export function onMilestone(fn: (n: number) => void): void {
  milestoneListeners.add(fn)
}

/** `tracker` is null when ads and trackers aren't being told apart. */
export function countBlocked(tracker: boolean | null, requestUrl?: string, pageUrl?: string | null): void {
  stats.data.blocked++
  const d = stats.data
  // History for the charts in Settings: per day (30 days kept), per site, per company.
  const day = new Date().toISOString().slice(0, 10)
  d.days ??= {}
  d.days[day] = (d.days[day] ?? 0) + 1
  if (Object.keys(d.days).length > 30) delete d.days[Object.keys(d.days).sort()[0]]
  if (pageUrl && /^https?:/.test(pageUrl)) {
    d.sites ??= {}
    const site = siteOf(pageUrl)
    d.sites[site] = (d.sites[site] ?? 0) + 1
    // Keep the 200 busiest sites.
    const keys = Object.keys(d.sites)
    if (keys.length > 220) for (const k of keys.sort((a, b) => d.sites![a] - d.sites![b]).slice(0, 20)) delete d.sites[k]
  }
  if (requestUrl) {
    d.companies ??= {}
    const who = companyOf(requestUrl)
    d.companies[who] = (d.companies[who] ?? 0) + 1
  }
  if (MILESTONES.includes(stats.data.blocked)) for (const fn of milestoneListeners) fn(stats.data.blocked)
  if (tracker === true) stats.data.trackers = (stats.data.trackers ?? 0) + 1
  if (tracker === false) stats.data.ads = (stats.data.ads ?? 0) + 1
  stats.save()
}

export function blockStats(): AegisStats {
  const d = stats.data
  return { blocked: d.blocked, since: d.since, ads: d.ads ?? 0, trackers: d.trackers ?? 0, days: d.days ?? {}, sites: d.sites ?? {}, companies: d.companies ?? {} }
}
