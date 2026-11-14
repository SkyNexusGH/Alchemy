import { PANEL_PRESETS, type Appearance, type CustomEngine, type Performance, type Settings, type SpeedDialItem } from '@shared/types'
import { JsonStore } from './store'

const DEFAULT_APPEARANCE: Appearance = {
  mode: 'alchemy',
  background: 'default',
  customBackground: null,
  accent: '#ec4856',
  showClock: true,
  showSearch: true,
  showSpeedDial: true,
  backgroundDim: 25,
  roundness: 'normal',
  compactTabs: false,
  font: 'inter',
  clockStyle: 'classic',
  highContrast: false,
  reduceMotion: false,
  bookmarkStyle: 'classic',
  countStyle: 'pill',
  material: 'solid',
  siteTint: false,
  iconSet: 'standard'
}

export const DEFAULT_PERFORMANCE: Performance = {
  heavy: false,
  ramLimitGB: 0,
  pageMemoryMB: 4096,
  hardwareAcceleration: true,
  awakeSites: [],
  networkLimitMbps: 0
}

const DEFAULT_SPEED_DIAL: SpeedDialItem[] = [
  { id: 'fivenova', title: 'FiveNova', url: 'https://fivenova.org/' },
  { id: 'myhue', title: 'MyHue', url: 'https://myhue.uk/' }
]

// Ready to use with Tab in the address bar: "yt" then Tab searches YouTube.
const DEFAULT_ENGINES: CustomEngine[] = [
  { id: 'youtube', name: 'YouTube', keyword: 'yt', search: 'https://www.youtube.com/results?search_query=%s' },
  { id: 'wikipedia', name: 'Wikipedia', keyword: 'w', search: 'https://en.wikipedia.org/w/index.php?search=%s' },
  { id: 'github', name: 'GitHub', keyword: 'gh', search: 'https://github.com/search?q=%s' }
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
  widgets: { weather: false, todo: false, news: false, focus: false, recent: false },
  weatherPlace: null,
  tempUnit: 'C',
  todos: [],
  countdown: null,
  translateTo: '',
  newsFeeds: ['https://feeds.bbci.co.uk/news/rss.xml', 'https://www.theverge.com/rss/index.xml', 'https://feeds.arstechnica.com/arstechnica/index'],
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
  sidebar: 'shown',
  sidebarSide: 'left',
  tabLayout: 'horizontal',
  videoPopout: true,
  autoPopout: true,
  customEngines: DEFAULT_ENGINES,
  askDefaultBrowser: true,
  torBridges: false,
  maskedUsesTor: false,
  splitBlockCounts: false,
  aegisLevel: 'comfort',
  multiEngines: ['google', 'bing', 'duckduckgo'],
  lab: { ask: false, instantAnswers: false, voice: false, tabSearch: true, searchEverywhere: true, smartAsk: false, voiceModel: 'small', voiceLanguage: '' },
  passwordManager: true,
  forceDark: false,
  forceDarkOff: [],
  forceDarkWhen: 'always',
  forceDarkBrightness: 100,
  forceDarkContrast: 100,
  forceDarkDimImages: false,
  elixirs: {},
  pasteProtection: true,
  fingerprintProfiles: true,
  batterySaver: 'auto',
  developer: false,
  aegisSiteLevels: {},
  aegisPanels: true,
  blockAutoplay: false,
  webrtcStrict: false,
  sendDnt: false,
  fingerprintOff: [],
  pwNever: [],
  autofill: true,
  pwGenerator: { length: 20, symbols: true, readable: true },
  lockWithHello: false,
  newTabPosition: 'end',
  afterClose: 'recent',
  ctrlTabOrder: 'recent',
  performance: DEFAULT_PERFORMANCE
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
  {
    // Quote, Now playing and Aegis stats were retired; Countdown joined the focus timer.
    const old = (s.widgets ?? {}) as Record<string, boolean>
    s.widgets = { ...DEFAULTS.widgets, ...old }
    if (old.countdown) s.widgets.focus = true
    for (const k of ['quote', 'music', 'stats', 'countdown']) delete (s.widgets as Record<string, boolean>)[k]
  }
  s.lab = { ...DEFAULTS.lab, ...(s.lab ?? {}) }
  s.performance = { ...DEFAULT_PERFORMANCE, ...(s.performance ?? {}) }
  s.customEngines ??= DEFAULT_ENGINES
  delete s.theme
  if (!s.workspaces?.length) s.workspaces = [{ id: DEFAULT_WORKSPACE, name: 'Home', icon: 'home', accent: null }]
  s.workspaces = s.workspaces.map((w) => {
    const old = w as unknown as { theme?: string; icon: string }
    const isIconId = /^[a-z]+$/.test(old.icon ?? '')
    return {
      id: w.id,
      name: w.name,
      // Emoji icons became Alchemy's own icons; anything unknown falls back to the letter.
      icon: isIconId ? old.icon : w.id === DEFAULT_WORKSPACE ? 'home' : '',
      accent: w.accent !== undefined ? w.accent : w.id === DEFAULT_WORKSPACE ? null : (OLD_THEME_ACCENTS[old.theme ?? ''] ?? null)
    }
  })
  // The original default speed dial is replaced by the new defaults, unless edited.
  const OLD_DIAL = ['yt', 'gh', 'rd', 'wk', 'gm', 'tw']
  if (s.speedDial.length && s.speedDial.every((d) => OLD_DIAL.includes(d.id))) s.speedDial = DEFAULT_SPEED_DIAL
  // v2: "dark" used to be the navy look, which is now its own mode, Alchemy; dark is true black.
  if ((s.version ?? 1) < 2) {
    if (s.appearance.mode === 'dark') s.appearance.mode = 'alchemy'
    s.version = 2
  }
  // v3: the navy mode and its plain theme lost their old Ovyra names.
  if ((s.version ?? 1) < 3) {
    if ((s.appearance.mode as string) === 'ovyra') s.appearance.mode = 'alchemy'
    if (s.appearance.background === 'plain-ovyra') s.appearance.background = 'plain-alchemy'
    s.version = 3
  }
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
