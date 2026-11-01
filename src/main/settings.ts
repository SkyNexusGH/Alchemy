import { PANEL_PRESETS, type Settings } from '@shared/types'
import { JsonStore } from './store'

const DEFAULTS: Settings = {
  searchEngine: 'google',
  searchSuggestions: true,
  startup: 'restore',
  sleepAfterMinutes: 15,
  showBookmarksBar: true,
  theme: 'aurora',
  downloadDir: null,
  askWhereToSave: false,
  speedDial: [
    { id: 'yt', title: 'YouTube', url: 'https://www.youtube.com/' },
    { id: 'gh', title: 'GitHub', url: 'https://github.com/' },
    { id: 'rd', title: 'Reddit', url: 'https://www.reddit.com/' },
    { id: 'wk', title: 'Wikipedia', url: 'https://www.wikipedia.org/' },
    { id: 'gm', title: 'Gmail', url: 'https://mail.google.com/' },
    { id: 'tw', title: 'Twitch', url: 'https://www.twitch.tv/' }
  ],
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
// Before workspaces existed the theme was global; it becomes the first workspace's theme.
if (!store.data.workspaces.length) {
  store.data.workspaces = [{ id: DEFAULT_WORKSPACE, name: 'Home', theme: store.data.theme, icon: '' }]
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
