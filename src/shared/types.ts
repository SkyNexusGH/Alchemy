// Types shared by the main process, preload and renderer.

export type Security = 'secure' | 'insecure' | 'internal' | 'none'

export interface TabState {
  id: number
  url: string
  /** What the omnibox shows ('' for the new tab page). */
  displayUrl: string
  title: string
  favicon: string | null
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  audible: boolean
  muted: boolean
  pinned: boolean
  sleeping: boolean
  /** The page is playing in Alchemy's floating video window. */
  floating: boolean
  /** Volume boost, 1 = normal. */
  boost: number
  /** Sound effects on the tab's videos. */
  bass: boolean
  mono: boolean
  spatial: boolean
  zoom: number
  security: Security
  bookmarked: boolean
  /** Ads and trackers blocked on the current page. */
  blocked: number
  /** Whether protections are active for this site. */
  shields: boolean
  workspaceId: string
  islandId: number | null
}

/** A tab's sound: volume boost and effects, applied to its videos. */
export interface TabAudio {
  boost: number
  bass: boolean
  mono: boolean
  spatial: boolean
}

export interface Workspace {
  id: string
  name: string
  /** An Alchemy workspace icon id, or '' to show the name's first letter. */
  icon: string
  /** The workspace's own accent, or null to use the browser's. */
  accent: string | null
}

export interface IslandState {
  id: number
  color: string
  collapsed: boolean
  /** Made by the user (Create tab group), so it stays even with a single tab. */
  manual?: boolean
}

/** A site pinned to the side rail (messengers, music, ...). */
export interface PanelItem {
  id: string
  title: string
  url: string
  color: string
}

export interface PanelState extends PanelItem {
  favicon: string | null
  loaded: boolean
  unread: number
}

export interface ShieldsInfo {
  site: string
  enabled: boolean
  /** Protections are off globally (settings), not just for this site. */
  globallyOff: boolean
  blocked: number
  /** Blocked request counts by host, most first. */
  hosts: [string, number][]
  totalBlocked: number
  since: number
}

/** Alchemy Tor's connection, shown on its connecting page and in Settings. */
export interface TorStatus {
  state: 'off' | 'starting' | 'ready' | 'error'
  /** Tor's own bootstrap progress, 0 to 100. */
  progress: number
  message: string
  /** Connecting through Snowflake bridges (for networks that block Tor). */
  bridges: boolean
  /** This build of Alchemy includes Tor. */
  available?: boolean
}

export interface UpdateState {
  /** 'disabled' in development builds, which can't update themselves. */
  status: 'disabled' | 'idle' | 'checking' | 'downloading' | 'ready' | 'latest' | 'error'
  version?: string
  percent?: number
  error?: string
}

export interface FilterStatus {
  ready: boolean
  lists: number
  updated: number | null
  updating: boolean
  error: string | null
}

export interface FindState {
  open: boolean
  query: string
  active: number
  matches: number
}

export interface WindowState {
  tabs: TabState[]
  activeId: number | null
  find: FindState
  fullscreen: boolean
  maximized: boolean
  private: boolean
  /** An Alchemy Tor window (Masked Mode through Tor). */
  tor: boolean
  workspaceId: string
  islands: IslandState[]
  /** The side panel open in this window, if any. */
  panelId: string | null
  panels: PanelState[]
  /** Tab ids shown side by side, when split view is on. */
  split: [number, number] | null
  /** The active tab has DevTools open (docked on the right). */
  devtools: boolean
}

export type BuiltinEngineId =
  | 'google'
  | 'duckduckgo'
  | 'brave'
  | 'bing'
  | 'startpage'
  | 'yahoo'
  | 'yandex'
  | 'ecosia'
  | 'qwant'
  | 'mojeek'
  | 'baidu'
  | 'kagi'
/** A built-in engine id, or the id of one of the user's own engines. */
export type SearchEngineId = string

/** A search engine the user added. `search` has %s where the query goes. */
export interface CustomEngine {
  id: string
  name: string
  /** Typed in the address bar, then Tab, to search with this engine. */
  keyword: string
  search: string
}

export interface SpeedDialItem {
  id: string
  title: string
  url: string
}

export interface Settings {
  searchEngine: SearchEngineId
  searchSuggestions: boolean
  startup: 'restore' | 'newtab'
  /** 0 disables sleeping tabs. */
  sleepAfterMinutes: number
  showBookmarksBar: boolean
  appearance: Appearance
  /** The first-run setup wizard has been completed (or skipped). */
  onboarded: boolean
  downloadDir: string | null
  askWhereToSave: boolean
  speedDial: SpeedDialItem[]
  // Privacy
  adblock: boolean
  blockCookieBanners: boolean
  blockThirdPartyCookies: boolean
  httpsUpgrade: boolean
  fingerprintProtection: boolean
  sendGpc: boolean
  // Opera-style features
  workspaces: Workspace[]
  panels: PanelItem[]
  panelWidth: number
  /** Closed panels unload after this long (0 = keep running for notifications). */
  panelSleepMinutes: number
  tabIslands: boolean
  videoPopout: boolean
  /** Switching away from a tab with a playing video floats the video. */
  autoPopout: boolean
  customEngines: CustomEngine[]
  /** Offer to become the default browser at startup. */
  askDefaultBrowser: boolean
  /** Alchemy Tor always connects through Snowflake bridges. */
  torBridges: boolean
  /** The version whose What's new page was last shown. */
  lastSeenVersion?: string
  performance: Performance
  /** Bumped when saved settings need a one-time migration. */
  version?: number
}

export interface Performance {
  /** Heavy Mode: tabs and panels never sleep or slow down, and pages may use more memory. */
  heavy: boolean
  /** When Alchemy uses more than this (GB), the least recently used tabs go to sleep. 0 = no limit. */
  ramLimitGB: number
  /** JavaScript memory each page may use in Heavy Mode, in MB. Applies after a restart. */
  pageMemoryMB: number
  /** Use the graphics card for drawing pages. Applies after a restart. */
  hardwareAcceleration: boolean
  /** Sites (hosts) whose tabs never go to sleep. */
  awakeSites: string[]
  /** Network limiter: the most Alchemy may download or upload, in Mbit/s. 0 = no limit. */
  networkLimitMbps: number
}

export const ISLAND_COLORS = ['#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#60a5fa', '#fb7185', '#2dd4bf', '#fb923c']
export const ISLAND_COLOR_NAMES = ['Purple', 'Pink', 'Green', 'Yellow', 'Blue', 'Red', 'Teal', 'Orange']

export const PANEL_PRESETS: PanelItem[] = [
  { id: 'whatsapp', title: 'WhatsApp', url: 'https://web.whatsapp.com/', color: '#25d366' },
  { id: 'telegram', title: 'Telegram', url: 'https://web.telegram.org/a/', color: '#229ed9' },
  { id: 'discord', title: 'Discord', url: 'https://discord.com/app', color: '#5865f2' },
  { id: 'messenger', title: 'Messenger', url: 'https://www.messenger.com/', color: '#a033ff' },
  { id: 'instagram', title: 'Instagram', url: 'https://www.instagram.com/direct/inbox/', color: '#e1306c' },
  { id: 'myhue', title: 'MyHue', url: 'https://myhue.uk/', color: '#8b5cf6' },
  { id: 'spotify', title: 'Spotify', url: 'https://open.spotify.com/', color: '#1db954' },
  { id: 'x', title: 'X', url: 'https://x.com/', color: '#71767b' },
  { id: 'ytmusic', title: 'YouTube Music', url: 'https://music.youtube.com/', color: '#ff0033' },
  { id: 'gmail', title: 'Gmail', url: 'https://mail.google.com/', color: '#ea4335' },
  { id: 'chatgpt', title: 'ChatGPT', url: 'https://chatgpt.com/', color: '#10a37f' }
]

export interface HistoryVisit {
  url: string
  title: string
  favicon: string | null
  time: number
}

export interface Bookmark {
  id: string
  parentId: string | null
  type: 'url' | 'folder'
  title: string
  url?: string
  favicon?: string | null
  created: number
}

export type DownloadStatus = 'progressing' | 'paused' | 'completed' | 'cancelled' | 'interrupted'

export interface DownloadState {
  id: string
  url: string
  filename: string
  path: string
  status: DownloadStatus
  received: number
  total: number
  speed: number
  started: number
  /** Downloaded in a private window; forgotten when private browsing ends. */
  incognito?: boolean
}

export interface Suggestion {
  kind: 'search' | 'url' | 'history' | 'bookmark' | 'suggest'
  title: string
  /** The text navigated to when chosen. */
  value: string
  /** Secondary line (usually the URL). */
  detail?: string
  favicon?: string | null
}

export interface LocalSuggestions {
  items: Suggestion[]
  /** A full URL/host that begins with the typed text, for inline autocomplete. */
  inline: string | null
}

export type OverlayPayload =
  | { kind: 'omnibox'; items: Suggestion[]; selected: number }
  | { kind: 'downloads' }
  | { kind: 'shields'; tabId: number }
  | { kind: 'workspace'; workspaceId: string | null }
  | { kind: 'add-panel' }
  | { kind: 'palette' }
  | { kind: 'menu'; items: MenuModel[]; x: number; y: number }
  | { kind: 'app' }
  | { kind: 'eyedropper'; image: string }
  | { kind: 'tabcard'; tabId: number }

/** What the Alchemy menu (the logo button) shows. */
export interface AppMenuInfo {
  version: string
  update: UpdateState
  /** Zoom of the current page in percent, or null without a page. */
  zoom: number | null
  private: boolean
  workspaceId: string | null
  /** Memory used by the whole browser, in MB. */
  memoryMB: number
  tabs: number
  sleeping: number
  blocked: number
  extensions: { id: string; name: string; icon: string | null }[]
}

export interface MenuModel {
  id: string
  type: 'normal' | 'separator' | 'checkbox' | 'radio'
  label?: string
  /** Keyboard shortcut shown on the right. */
  hint?: string
  enabled: boolean
  checked?: boolean
  /** A color dot before the label. */
  color?: string
  submenu?: MenuModel[]
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Commands the main process asks the shell UI to perform. */
export type ShellCommand = 'focus-omnibox' | 'open-find'

/** A look: a background image with the accent and light/dark mode it was made for. */
export interface ThemePreset {
  id: string
  name: string
  /** File name under /backgrounds (without .jpg), or null for a plain background. */
  image: string | null
  accent: string
  mode: ColorMode
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'default', name: 'Alchemy', image: 'default', accent: '#ec4856', mode: 'ovyra' },
  { id: 'dark-synth', name: 'Dark Synth', image: 'dark-synth', accent: '#4488bd', mode: 'dark' },
  { id: 'light-synth', name: 'Light Synth', image: 'light-synth', accent: '#fee9c4', mode: 'light' },
  { id: 'myrical', name: 'Myrical', image: 'myrical', accent: '#af7ab6', mode: 'dark' },
  { id: 'nomad', name: 'Nomad', image: 'nomad', accent: '#fea757', mode: 'light' },
  { id: 'soul-hills', name: 'Soul Hills', image: 'soul-hills', accent: '#77793e', mode: 'light' },
  { id: 'plain-ovyra', name: 'Plain Alchemy', image: null, accent: '#ec4856', mode: 'ovyra' },
  { id: 'plain-dark', name: 'Plain black', image: null, accent: '#ec4856', mode: 'dark' },
  { id: 'plain-light', name: 'Plain light', image: null, accent: '#ec4856', mode: 'light' }
]

/** The accent palette: a full rainbow plus the colors that go with each background. */
export const ACCENTS = [
  '#ec4856',
  '#ef2e2e',
  '#ef8b2e',
  '#efb92e',
  '#a6ef2e',
  '#32ef2e',
  '#2eefbb',
  '#2ed2ef',
  '#2e70ef',
  '#322eef',
  '#772eef',
  '#b72eef',
  '#ef2ee7',
  '#ef2e8b',
  '#ef2e45',
  '#fea757',
  '#77793e',
  '#af7ab6',
  '#4488bd',
  '#fee9c4'
]

/** The two base colors of the interface. */
export const BASE_DARK = '#090e17'
export const BASE_LIGHT = '#d6dae4'
export const BASE_BLACK = '#000000'

/** Light; Alchemy (the navy brand look); Dark (true black, easy on OLED); or follow Windows. */
export type ColorMode = 'light' | 'ovyra' | 'dark' | 'system'

/** The base color behind the interface in a mode, given whether Windows is dark. */
export function baseColor(mode: ColorMode, systemDark: boolean): string {
  if (mode === 'light' || (mode === 'system' && !systemDark)) return BASE_LIGHT
  return mode === 'ovyra' ? BASE_DARK : BASE_BLACK
}

export interface Appearance {
  mode: ColorMode
  /** A theme preset id, or 'custom' for the user's own image. */
  background: string
  /** Path (inside the app's data folder) of a custom background image. */
  customBackground: string | null
  accent: string
  /** New tab page */
  showClock: boolean
  showSearch: boolean
  showSpeedDial: boolean
  /** 0–70: how much the background image is darkened (or lightened) behind content. */
  backgroundDim: number
  /** Rounder or squarer corners across the interface. */
  roundness: 'sharp' | 'normal' | 'round'
  compactTabs: boolean
  font: UiFont
  clockStyle: ClockStyle
  /** Stronger text and borders, for bright rooms and easier reading. */
  highContrast: boolean
}

export type ClockStyle = 'classic' | 'seconds' | 'bold' | 'analog' | 'words'

export type UiFont = 'inter' | 'segoe' | 'nunito' | 'grotesk' | 'outfit' | 'mono'

export interface EngineInfo {
  id: string
  name: string
  keyword: string
  search: string
  suggest: string | null
  custom: boolean
}

export const SEARCH_ENGINES: Record<BuiltinEngineId, { name: string; keyword: string; search: string; suggest: string | null }> = {
  google: {
    keyword: 'g',
    name: 'Google',
    search: 'https://www.google.com/search?q=%s',
    suggest: 'https://suggestqueries.google.com/complete/search?client=firefox&q=%s'
  },
  duckduckgo: {
    keyword: 'd',
    name: 'DuckDuckGo',
    search: 'https://duckduckgo.com/?q=%s',
    suggest: 'https://duckduckgo.com/ac/?type=list&q=%s'
  },
  brave: {
    keyword: 'br',
    name: 'Brave Search',
    search: 'https://search.brave.com/search?q=%s',
    suggest: 'https://search.brave.com/api/suggest?q=%s'
  },
  bing: {
    keyword: 'b',
    name: 'Bing',
    search: 'https://www.bing.com/search?q=%s',
    suggest: 'https://api.bing.com/osjson.aspx?query=%s'
  },
  startpage: {
    keyword: 'sp',
    name: 'Startpage',
    search: 'https://www.startpage.com/do/search?q=%s',
    suggest: null
  },
  yahoo: {
    keyword: 'y',
    name: 'Yahoo',
    search: 'https://search.yahoo.com/search?p=%s',
    suggest: null
  },
  yandex: {
    keyword: 'ya',
    name: 'Yandex',
    search: 'https://yandex.com/search/?text=%s',
    suggest: 'https://suggest.yandex.com/suggest-ff.cgi?part=%s'
  },
  ecosia: {
    keyword: 'e',
    name: 'Ecosia',
    search: 'https://www.ecosia.org/search?q=%s',
    suggest: 'https://ac.ecosia.org/autocomplete?q=%s&type=list'
  },
  qwant: {
    keyword: 'q',
    name: 'Qwant',
    search: 'https://www.qwant.com/?q=%s',
    suggest: null
  },
  mojeek: {
    keyword: 'm',
    name: 'Mojeek',
    search: 'https://www.mojeek.com/search?q=%s',
    suggest: null
  },
  baidu: {
    keyword: 'bd',
    name: 'Baidu',
    search: 'https://www.baidu.com/s?wd=%s',
    suggest: null
  },
  kagi: {
    keyword: 'k',
    name: 'Kagi',
    search: 'https://kagi.com/search?q=%s',
    suggest: null
  }
}

/** Every engine: the built-in ones first, then the user's. */
export function allEngines(s: Pick<Settings, 'customEngines'>): EngineInfo[] {
  const builtin = (Object.keys(SEARCH_ENGINES) as BuiltinEngineId[]).map((id) => ({ id, ...SEARCH_ENGINES[id], custom: false }))
  return [...builtin, ...(s.customEngines ?? []).map((e) => ({ ...e, suggest: null, custom: true }))]
}

/** The engine with this id (the default engine when not given), falling back to Google. */
export function engineOf(s: Pick<Settings, 'customEngines' | 'searchEngine'>, id?: string): EngineInfo {
  const list = allEngines(s)
  return list.find((e) => e.id === (id ?? s.searchEngine)) ?? list.find((e) => e.id === s.searchEngine) ?? list[0]
}

export function engineSearchUrl(engine: EngineInfo, query: string): string {
  return engine.search.replace('%s', encodeURIComponent(query))
}

export const INTERNAL_PAGES = ['newtab', 'history', 'bookmarks', 'downloads', 'settings', 'extensions', 'welcome', 'error', 'whatsnew', 'tor'] as const
export type InternalPage = (typeof INTERNAL_PAGES)[number]

export const NEW_TAB_URL = 'alchemy://newtab/'
