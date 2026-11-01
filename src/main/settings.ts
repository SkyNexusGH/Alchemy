import { PANEL_PRESETS, type Appearance, type Settings, type SpeedDialItem } from '@shared/types'
import { JsonStore } from './store'

const DEFAULT_APPEARANCE: Appearance = {
  mode: 'dark',
  background: 'default',
  customBackground: null,
  accent: '#ec4856',
  showClock: true,
  showSearch: true,
  showSpeedDial: true,
  backgroundDim: 25,
  roundness: 'normal',
  compactTabs: false
}

const DEFAULT_SPEED_DIAL: SpeedDialItem[] = [
  { id: 'fivenova', title: 'FiveNova', url: 'https://fivenova.org/' },
  { id: 'myhue', title: 'MyHue', url: 'https://myhue.uk/' }
]

const DEFAULTS: Settings = {
  searchEngine: 'google',
  searchSuggestions: true,
  startup: 'restore',
  sleepAfterMinutes: 15,
  showBookmarksBar: true,
  appearance: DEFAULT_APPEARANCE,
  onboarded: false,
  downloadDir: null,
  askWhereToSave: false,
  speedDial: DEFAULT_SPEED_DIAL,
  adblock: true,
  blockCookieBanners: true,
  blockThirdPartyCookies: true,
  httpsUpgrade: true,
  fingerprintProtection: true,
  sendGpc: true,
  workspaces: [],
  panels: PANEL_PRESETS.filter((p) => ['whatsapp', 'telegram', 'discord', 'spotify'].includes(p.id)),
  panelWidth: 480,
  panelSleepMinutes: 30,
  tabIslands: true,
  videoPopout: true
}

export const DEFAULT_WORKSPACE = 'home'

const store = new JsonStore<Settings>('settings', DEFAULTS)
migrate(store.data as Settings & Record<string, unknown>)

/** Brings settings saved by older versions up to date. */
function migrate(s: Settings & Record<string, unknown>): void {
  // Older versions had one gradient theme per workspace and a global theme id.
  const OLD_THEME_ACCENTS: Record<string, string> = {
    aurora: '#772eef',
    sunset: '#ef8b2e',
    ocean: '#2ed2ef',
    jungle: '#32ef2e',
    ember: '#ef2e2e',
    candy: '#ef2e8b',
    electric: '#322eef'
  }
  s.appearance = { ...DEFAULT_APPEARANCE, ...(s.appearance ?? {}) }
  delete s.theme
  if (!s.workspaces?.length) s.workspaces = [{ id: DEFAULT_WORKSPACE, name: 'Home', icon: 'home', accent: null }]
  s.workspaces = s.workspaces.map((w) => {
    const old = w as unknown as { theme?: string; icon: string }
    const isIconId = /^[a-z]+$/.test(old.icon ?? '')
    return {
      id: w.id,
      name: w.name,
      // Emoji icons became Ovyra's own icons; anything unknown falls back to the letter.
      icon: isIconId ? old.icon : w.id === DEFAULT_WORKSPACE ? 'home' : '',
      accent: w.accent !== undefined ? w.accent : w.id === DEFAULT_WORKSPACE ? null : (OLD_THEME_ACCENTS[old.theme ?? ''] ?? null)
    }
  })
  // The original default speed dial is replaced by the new defaults, unless edited.
  const OLD_DIAL = ['yt', 'gh', 'rd', 'wk', 'gm', 'tw']
  if (s.speedDial.length && s.speedDial.every((d) => OLD_DIAL.includes(d.id))) s.speedDial = DEFAULT_SPEED_DIAL
}

const listeners = new Set<(s: Settings) => void>()

export function getSettings(): Settings {
  return store.data
}

export function updateSettings(patch: Partial<Settings>): Settings {
  store.data = { ...store.data, ...patch }
  store.save()
  for (const fn of listeners) fn(store.data)
  return store.data
}

export function onSettingsChanged(fn: (s: Settings) => void): void {
  listeners.add(fn)
}
