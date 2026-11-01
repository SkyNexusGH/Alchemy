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

export interface Workspace {
  id: string
  name: string
  theme: string
  /** An emoji, or '' to show the name's first letter. */
  icon: string
}

export interface IslandState {
  id: number
  color: string
  collapsed: boolean
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
  workspaceId: string
  islands: IslandState[]
  /** The side panel open in this window, if any. */
  panelId: string | null
  panels: PanelState[]
  /** Tab ids shown side by side, when split view is on. */
  split: [number, number] | null
}

export type SearchEngineId = 'google' | 'duckduckgo' | 'brave' | 'bing' | 'startpage'

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
  theme: string
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
}

export const ISLAND_COLORS = ['#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#60a5fa', '#fb7185', '#2dd4bf', '#fb923c']

export const PANEL_PRESETS: PanelItem[] = [
  { id: 'whatsapp', title: 'WhatsApp', url: 'https://web.whatsapp.com/', color: '#25d366' },
  { id: 'telegram', title: 'Telegram', url: 'https://web.telegram.org/a/', color: '#229ed9' },
  { id: 'discord', title: 'Discord', url: 'https://discord.com/app', color: '#5865f2' },
  { id: 'messenger', title: 'Messenger', url: 'https://www.messenger.com/', color: '#a033ff' },
  { id: 'instagram', title: 'Instagram', url: 'https://www.instagram.com/direct/inbox/', color: '#e1306c' },
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

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Commands the main process asks the shell UI to perform. */
export type ShellCommand = 'focus-omnibox' | 'open-find'

export interface Theme {
  id: string
  name: string
  a: string
  b: string
}

export const THEMES: Theme[] = [
  { id: 'aurora', name: 'Aurora', a: '#8b5cf6', b: '#ec4899' },
  { id: 'sunset', name: 'Sunset', a: '#f97316', b: '#e11d48' },
  { id: 'ocean', name: 'Ocean', a: '#06b6d4', b: '#3b82f6' },
  { id: 'jungle', name: 'Jungle', a: '#22c55e', b: '#14b8a6' },
  { id: 'ember', name: 'Ember', a: '#ef4444', b: '#f59e0b' },
  { id: 'candy', name: 'Candy', a: '#f472b6', b: '#a78bfa' },
  { id: 'electric', name: 'Electric', a: '#6366f1', b: '#22d3ee' }
]

export const SEARCH_ENGINES: Record<SearchEngineId, { name: string; search: string; suggest: string | null }> = {
  google: {
    name: 'Google',
    search: 'https://www.google.com/search?q=%s',
    suggest: 'https://suggestqueries.google.com/complete/search?client=firefox&q=%s'
  },
  duckduckgo: {
    name: 'DuckDuckGo',
    search: 'https://duckduckgo.com/?q=%s',
    suggest: 'https://duckduckgo.com/ac/?type=list&q=%s'
  },
  brave: {
    name: 'Brave Search',
    search: 'https://search.brave.com/search?q=%s',
    suggest: 'https://search.brave.com/api/suggest?q=%s'
  },
  bing: {
    name: 'Bing',
    search: 'https://www.bing.com/search?q=%s',
    suggest: 'https://api.bing.com/osjson.aspx?query=%s'
  },
  startpage: {
    name: 'Startpage',
    search: 'https://www.startpage.com/do/search?q=%s',
    suggest: null
  }
}

export const INTERNAL_PAGES = ['newtab', 'history', 'bookmarks', 'downloads', 'settings', 'extensions', 'error'] as const
export type InternalPage = (typeof INTERNAL_PAGES)[number]

export const NEW_TAB_URL = 'ovyra://newtab/'
