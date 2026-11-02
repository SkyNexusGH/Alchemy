import { hostOf } from '@shared/url'
import { getSettings, updateSettings } from './settings'

/** Sites the user keeps awake: their tabs never go to sleep (music, dashboards, chats). */
export function isAwakeSite(url: string): boolean {
  const host = hostOf(url)
  return !!host && getSettings().performance.awakeSites.some((s) => host === s || host.endsWith(`.${s}`))
}

export function setAwakeSite(url: string, awake: boolean): void {
  const host = hostOf(url)
  if (!host) return
  const perf = getSettings().performance
  const rest = perf.awakeSites.filter((s) => s !== host)
  updateSettings({ performance: { ...perf, awakeSites: awake ? [...rest, host] : rest } })
}
