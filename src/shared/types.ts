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
  /** The page's own colour (its theme-color), for the site-tinted toolbar. */
  themeColor: string | null
  /** The language the page says it's in, and whether Alchemy translated it. */
  pageLang: string | null
  translated: boolean
  /** Ads and trackers blocked on the current page. */
  blocked: number
  /** Of those, how many were trackers (only counted while splitBlockCounts is on). */
  trackers: number
  /** Whether protections are active for this site. */
  shields: boolean
  workspaceId: string
  islandId: number | null
  /** The page is using the camera, microphone or screen right now. */
  recording: boolean
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
  /** Opened when you switch to the workspace and it has no tabs ('' = the new tab page). */
  homeUrl?: string
  /** Its own search engine ('' or missing = the browser's). */
  searchEngine?: string
  /** The bookmarks folder its bookmarks bar shows (missing = the Bookmarks bar folder). */
  barFolder?: string
  /** The sidebar sites shown in it (missing = all of them). */
  panels?: string[]
}

export interface IslandState {
  id: number
  color: string
  collapsed: boolean
  /** Made by the user (Create tab group), so it stays even with a single tab. */
  manual?: boolean
  /** A short name shown on the group's dot. */
  name?: string
}

/** A site pinned to the side rail (messengers, music, ...). */
export interface PanelItem {
  id: string
  title: string
  url: string
  color: string
  /** Load the desktop version of the site instead of the mobile one. */
  desktop?: boolean
  /** Your own icon: an emoji or up to two letters, shown instead of the site's (#209). */
  badge?: string
}

export interface PanelState extends PanelItem {
  favicon: string | null
  loaded: boolean
  unread: number
}

/** A saved login, as Alchemy's own pages see it (never with the password). */
export interface SavedPassword {
  id: string
  origin: string
  username: string
  created: number
  updated: number
  /** How many known data breaches contain this password (undefined: not checked yet). */
  breaches?: number
  checked?: number
}

/** An extension in the Alchemy Extensions store (from its signed list). */
export interface StoreExtension {
  id: string
  name: string
  summary: string
  description: string
  category: string
  homepage: string | null
  author: string
  /** The author's MyHue page. */
  authorUrl?: string | null
  installs: number
  version: string
  versionId: string
  sha256: string
  size: number
  permissions: string[]
  icon: string | null
  download: string
  updated: number
}

/** A page on the Later list (#1156). */
export interface LaterItem {
  url: string
  title: string
  favicon: string | null
  added: number
  read: boolean
}

/** A saved address for filling in forms. */
export interface AutofillAddress {
  id: string
  name: string
  organization?: string
  street: string
  city: string
  region?: string
  postcode: string
  country: string
  phone?: string
  email?: string
}

/** A saved payment card (never with its security code). */
export interface AutofillCard {
  id: string
  name: string
  number: string
  expMonth: string
  expYear: string
}

/** What Settings shows of a card. */
export interface AutofillCardInfo {
  id: string
  name: string
  last4: string
  expMonth: string
  expYear: string
  brand: string
}

/** A short message in the title bar, with an optional action (a palette command). */
export interface ToastData {
  text: string
  /** How long it stays, in milliseconds. */
  ms?: number
  kind?: 'normal' | 'gold'
  action?: { label: string; cmd: string; arg?: string }
  /** A second, quieter choice beside the action. */
  action2?: { label: string; cmd: string; arg?: string }
}

export interface ShieldsInfo {
  site: string
  enabled: boolean
  /** Protections are off globally (settings), not just for this site. */
  globallyOff: boolean
  blocked: number
  /** Of this page's blocked requests, how many were trackers. */
  trackers: number
  /** Ads and trackers are counted separately. */
  split: boolean
  /** Blocked request counts by host, most first. */
  hosts: [string, number][]
  totalBlocked: number
  /** Totals since separate counting was turned on. */
  totalAds: number
  totalTrackers: number
  since: number
  /** #396 This site's own Aegis level, if it has one. */
  siteLevel?: 'chill' | 'comfort' | 'extreme'
  /** #447 Fingerprint protection is off for this site. */
  fingerprintOff?: boolean
}

/** The Aegis blocker's history, for the charts in Settings. */
export interface AegisStats {
  blocked: number
  since: number
  ads: number
  trackers: number
  /** Blocked per day (YYYY-MM-DD), last 30 days. */
  days: Record<string, number>
  /** Blocked per site you were on. */
  sites: Record<string, number>
  /** Blocked per company behind the request ("Google", "Meta", …). */
  companies: Record<string, number>
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
  /** Tab ids shown side by side, when split view is on (two or three). */
  split: number[] | null
  /** How much of the window the first of two split pages gets (0.2 to 0.8). */
  splitRatio: number
  /** Split pages are stacked top and bottom instead of side by side. */
  splitVertical: boolean
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
  /** New tab page widgets that are turned on. */
  widgets: Record<WidgetId, boolean>
  /** The weather widget's place, typed by the user (no location lookup). */
  weatherPlace: { name: string; lat: number; lon: number } | null
  tempUnit: 'C' | 'F'
  /** To-dos on the new tab page; `due` is a date like 2026-11-20 (#160). */
  todos: { id: string; text: string; done: boolean; due?: string }[]
  countdown: { label: string; date: string } | null
  /** RSS/Atom feeds for the news widget. */
  newsFeeds: string[]
  /** Language pages are translated into ("en"); empty means Alchemy's own language. */
  translateTo: string
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
  /** The left sidebar (workspaces and sidebar sites): always shown, hidden until you
   *  move to the left edge ("Hidden Sidebar"), or off. */
  sidebar: 'shown' | 'hidden' | 'off'
  /** Which side of the window the sidebar is on. */
  sidebarSide: 'left' | 'right'
  /** Tabs across the title bar, or down the side. */
  tabLayout: 'horizontal' | 'vertical'
  videoPopout: boolean
  /** Switching away from a tab with a playing video floats the video. */
  autoPopout: boolean
  /** #586 Sites the automatic pop-out works on (empty = every site). */
  popoutSites?: string[]
  customEngines: CustomEngine[]
  /** Offer to become the default browser at startup. */
  askDefaultBrowser: boolean
  /** Alchemy Tor always connects through Snowflake bridges. */
  torBridges: boolean
  /** New Masked Mode windows go through Tor (they open as Alchemy Tor windows), hiding your IP. */
  maskedUsesTor: boolean
  /** Count ads and trackers separately (the shield, its panel and the Alchemy menu). */
  splitBlockCounts: boolean
  /** How hard the Aegis blocker blocks: Chill (ads only), Comfort (ads and trackers),
   *  Extreme (everything, including cookie banners and annoyances). */
  aegisLevel: 'chill' | 'comfort' | 'extreme'
  /** #396 Sites with their own Aegis level (registrable domain → level). */
  aegisSiteLevels?: Record<string, 'chill' | 'comfort' | 'extreme'>
  /** #419 Aegis also protects sidebar sites (messengers). */
  aegisPanels?: boolean
  /** #404 Videos only start playing after you click on the page. */
  blockAutoplay?: boolean
  /** #443 Video calls may only use the same route as normal browsing, so a VPN can't be gone around. */
  webrtcStrict?: boolean
  /** #445 Also send the older Do Not Track signal. */
  sendDnt?: boolean
  /** #447 Sites where fingerprint protection is off (registrable domains). */
  fingerprintOff?: string[]
  /** The engines "Search everywhere" opens side by side (up to three). */
  multiEngines: string[]
  /** Alchemy Lab: experiments that are switched on. The AI ones (ask, instantAnswers, voice) start off,
   *  and while they're off nothing about them shows anywhere but the Lab. */
  lab: {
    ask: boolean
    instantAnswers: boolean
    voice: boolean
    tabSearch: boolean
    searchEverywhere: boolean
    /** Ask uses the smarter model (about 480 MB): written answers, other languages, summaries. */
    smartAsk?: boolean
    /** Whisper size for voice search: smaller downloads faster, bigger hears better. */
    voiceModel?: 'tiny' | 'base' | 'small'
    /** The language you speak ('' = Alchemy's own language). */
    voiceLanguage?: string
  }
  /** Offer to save and fill passwords. */
  passwordManager: boolean
  /** Offer saved addresses and cards on forms. */
  autofill?: boolean
  /** Sites (origins) where Alchemy never offers to save a password. */
  pwNever?: string[]
  /** Strong passwords Alchemy suggests on sign-up forms. */
  pwGenerator?: { length: number; symbols: boolean; readable: boolean }
  /** Ask for Windows Hello when Alchemy opens, and after the PC was locked or asleep. */
  lockWithHello?: boolean
  /** Force dark mode: a dark version of every site that's bright. */
  forceDark: boolean
  /** Sites Force dark leaves alone. */
  forceDarkOff: string[]
  /** #676 When Force dark is on: always, at night (7 pm to 7 am), or when Windows is dark. */
  forceDarkWhen?: 'always' | 'night' | 'system'
  /** #677 Brightness and contrast of darkened pages, in percent (100 = as is). */
  forceDarkBrightness?: number
  forceDarkContrast?: number
  /** #678 Photos and videos a little dimmer on darkened pages. */
  forceDarkDimImages?: boolean
  /** Elixirs that are switched on (see ELIXIRS). */
  elixirs: Record<string, boolean>
  /** Stop pages changing what you copy, or writing to the clipboard without a click. */
  pasteProtection: boolean
  /** Each site sees a different, believable PC (screen size, CPU, memory). */
  fingerprintProfiles: boolean
  /** Save power: 'auto' turns on when the PC is running on battery. */
  batterySaver: 'auto' | 'on' | 'off'
  /** Where Ctrl+T and the + button open a tab: at the end, or right after the one you're on. */
  newTabPosition?: 'end' | 'next'
  /** Closing the tab you're on goes to the tab you used before it, or the one beside it. */
  afterClose?: 'recent' | 'beside'
  /** Ctrl+Tab goes through tabs by when you last used them, or in strip order. */
  ctrlTabOrder?: 'recent' | 'strip'
  /** Developer options: Inspect, custom scripts, memory in tab cards and Alchemy's own DevTools. */
  developer?: boolean
  /** How many times the default-browser reminder was closed. */
  defaultPromptDismissals?: number
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

export const ISLAND_COLORS = ['#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#60a5fa', '#fb7185', '#2dd4bf', '#fb923c', '#a3e635', '#38bdf8', '#e879f9', '#94a3b8']
export const ISLAND_COLOR_NAMES = ['Purple', 'Pink', 'Green', 'Yellow', 'Blue', 'Red', 'Teal', 'Orange', 'Lime', 'Sky', 'Magenta', 'Grey']

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
  { id: 'gmail', title: 'Gmail', url: 'https://mail.google.com/', color: '#ea4335' }
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
  /** Folders only: an icon from WORKSPACE_ICONS instead of the plain folder. */
  icon?: string
  /** Bookmarks only: your own labels, across folders (#253). */
  tags?: string[]
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
  /** Open the file by itself once it finishes (#343). */
  openWhenDone?: boolean
  /** Microsoft Defender's check of the finished file (#1180). */
  scan?: 'scanning' | 'clean' | 'threat' | 'unavailable'
  /** What's needed to carry on after Alchemy restarts (#337). */
  resume?: { urlChain: string[]; mimeType: string; etag: string; lastModified: string; startTime: number }
}

export interface Suggestion {
  kind: 'search' | 'url' | 'history' | 'bookmark' | 'suggest' | 'answer' | 'multi'
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
  | { kind: 'add-panel'; editId?: string }
  | { kind: 'palette' }
  | { kind: 'menu'; items: MenuModel[]; x: number; y: number }
  | { kind: 'app' }
  | { kind: 'eyedropper'; image: string }
  | { kind: 'tabcard'; tabId: number }
  | { kind: 'bmcard'; url: string; title: string; favicon: string | null }
  | { kind: 'panelcard'; id: string; title: string; url: string }
  | { kind: 'restyle' }
  | { kind: 'switcher'; items: { id: number; title: string; favicon: string | null; url: string }[]; index: number }

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
  /** The computer's memory, in MB, for the mana bar. */
  totalMB: number
  blocked: number
  /** Set when ads and trackers are counted separately. */
  split: { ads: number; trackers: number } | null
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
  { id: 'default', name: 'Alchemy', image: 'default', accent: '#ec4856', mode: 'alchemy' },
  { id: 'dark-synth', name: 'Dark Synth', image: 'dark-synth', accent: '#4488bd', mode: 'dark' },
  { id: 'light-synth', name: 'Light Synth', image: 'light-synth', accent: '#fee9c4', mode: 'light' },
  { id: 'myrical', name: 'Myrical', image: 'myrical', accent: '#af7ab6', mode: 'dark' },
  { id: 'nomad', name: 'Nomad', image: 'nomad', accent: '#fea757', mode: 'light' },
  { id: 'soul-hills', name: 'Soul Hills', image: 'soul-hills', accent: '#77793e', mode: 'light' },
  { id: 'plain-alchemy', name: 'Plain Alchemy', image: null, accent: '#ec4856', mode: 'alchemy' },
  { id: 'plain-dark', name: 'Plain black', image: null, accent: '#ec4856', mode: 'dark' },
  { id: 'plain-light', name: 'Plain light', image: null, accent: '#ec4856', mode: 'light' },
  { id: 'monochrome', name: 'Monochrome', image: null, accent: '#a1a1aa', mode: 'dark' }
]

/**
 * The accent palette: one color per hue, plus the accents of the background themes.
 * Kept short so every color is easy to tell apart; the "+" swatch picks anything else.
 */
export const ACCENTS = [
  '#ec4856',
  '#ef2e8b',
  '#ef8b2e',
  '#fea757',
  '#efb92e',
  '#fee9c4',
  '#77793e',
  '#32ef2e',
  '#2eefbb',
  '#2ed2ef',
  '#4488bd',
  '#772eef',
  '#af7ab6'
]

/** The two base colors of the interface. */
export const BASE_DARK = '#090e17'
export const BASE_LIGHT = '#d6dae4'
export const BASE_BLACK = '#000000'

/** Light; Alchemy (the navy brand look); Dark (true black, easy on OLED); or follow Windows. */
export type ColorMode = 'light' | 'alchemy' | 'dark' | 'system'

/** The base color behind the interface in a mode, given whether Windows is dark. */
export function baseColor(mode: ColorMode, systemDark: boolean): string {
  if (mode === 'light' || (mode === 'system' && !systemDark)) return BASE_LIGHT
  return mode === 'alchemy' ? BASE_DARK : BASE_BLACK
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
  /** Swap movement (popping, sliding, bouncing) for plain, quick changes. */
  reduceMotion: boolean
  /** How the bookmarks bar draws its bookmarks. */
  bookmarkStyle: 'classic' | 'pills' | 'icons' | 'dock'
  /** How the shield shows how much the Aegis blocker stopped on a page. */
  countStyle: 'pill' | 'badge' | 'ring' | 'none'
  /** What the window's own surfaces are made of: solid colour, Windows 11 Mica or Acrylic,
   *  or Frosted glass (your wallpaper, blurred, behind the tabs and toolbar). */
  material: 'solid' | 'mica' | 'acrylic' | 'glass'
  /** The toolbar picks up a tint of the site's own colour. */
  siteTint: boolean
  /** Icons drawn normally, or as runes where there's a fitting one. */
  iconSet: 'standard' | 'runes'
  /** The new tab clock: as Windows does it, or always 12 or 24 hours (#172). */
  clockHours?: 'auto' | '12' | '24'
  /** "Good morning, Sam" (#173). */
  greetingName?: string
  /** How much the background is blurred, in pixels (#177). */
  backgroundBlur?: number
  /** A folder of your own pictures; a different one on each new tab (#175). */
  wallpaperFolder?: string | null
  /** Minimal mode: just the clock and the search box (#180). */
  minimal?: boolean
}

export type ClockStyle = 'classic' | 'seconds' | 'bold' | 'analog' | 'words'

export type UiFont = 'inter' | 'segoe' | 'nunito' | 'grotesk' | 'outfit' | 'mono'

/** MyHue Restyle: your own changes to one site. */
export interface SiteRestyle {
  /** CSS selectors of things you've hidden. */
  hide: string[]
  /** Your own CSS. */
  css: string
  font?: string
  /** Text size, as a percentage. */
  fontSize?: number
  /** #694 Your own colours for the page. */
  colors?: { bg?: string; text?: string; link?: string }
  /** #698 Your changes are kept but not applied for now. */
  paused?: boolean
}

/** A custom script: runs on matching sites when their pages load. */
export interface UserScript {
  id: string
  name: string
  /** Sites it runs on, comma separated: "youtube.com, *.reddit.com" or "*". */
  match: string
  code: string
  enabled: boolean
  /** #710 Also runs in Masked Mode (off unless you choose). */
  masked?: boolean
  /** #709 Installed from this address, and checked there for newer versions. */
  sourceUrl?: string
  version?: string
  /** #706 The last error it threw, and when. */
  lastError?: { message: string; at: number; url: string }
}

/** Elixirs: one-tap fixes for popular sites. */
export const ELIXIRS: { id: string; site: string; sites: string[]; title: string; hint: string; css: string }[] = [
  {
    id: 'yt-no-shorts',
    site: 'YouTube',
    sites: ['youtube.com'],
    title: 'No Shorts',
    hint: 'Hides Shorts from the home page, search and the menu.',
    css: `ytd-rich-shelf-renderer[is-shorts], ytd-reel-shelf-renderer, ytd-rich-section-renderer:has([is-shorts]), ytd-guide-entry-renderer:has(a[title="Shorts"]), ytd-mini-guide-entry-renderer[aria-label="Shorts"], ytm-reel-shelf-renderer { display: none !important; }`
  },
  {
    id: 'yt-no-endcards',
    site: 'YouTube',
    sites: ['youtube.com'],
    title: 'No end screens',
    hint: 'Removes the video cards that cover the last seconds of a video.',
    css: `.ytp-ce-element, .ytp-endscreen-content { display: none !important; }`
  },
  {
    id: 'yt-no-comments',
    site: 'YouTube',
    sites: ['youtube.com'],
    title: 'No comments',
    hint: 'Hides the comments under videos.',
    css: `ytd-comments#comments { display: none !important; }`
  },
  {
    id: 'reddit-no-promoted',
    site: 'Reddit',
    sites: ['reddit.com'],
    title: 'No promoted posts',
    hint: 'Hides ads made to look like posts.',
    css: `shreddit-ad-post, shreddit-comments-page-ad, .promotedlink, [data-promoted="true"] { display: none !important; }`
  },
  {
    id: 'x-no-promoted',
    site: 'X',
    sites: ['x.com', 'twitter.com'],
    title: 'No promoted posts',
    hint: 'Hides ads in the timeline.',
    css: `article:has([data-testid="placementTracking"]), div[data-testid="cellInnerDiv"]:has([data-testid="placementTracking"]) { display: none !important; }`
  },
  {
    id: 'x-no-trends',
    site: 'X',
    sites: ['x.com', 'twitter.com'],
    title: 'No trends',
    hint: 'Hides the trending list on the side.',
    css: `[data-testid="sidebarColumn"] section:has([data-testid="trend"]) { display: none !important; }`
  },
  {
    id: 'ig-no-reels',
    site: 'Instagram',
    sites: ['instagram.com'],
    title: 'No Reels button',
    hint: 'Removes the shortcut to Reels from the menu.',
    css: `a[href="/reels/"] { display: none !important; }`
  },
  {
    id: 'twitch-no-recommended',
    site: 'Twitch',
    sites: ['twitch.tv'],
    title: 'No recommended channels',
    hint: 'Keeps only the channels you follow in the side list.',
    css: `.side-nav-section[aria-label*="Recommended" i], .side-nav-section[aria-label*="Viewers Also" i] { display: none !important; }`
  },
  {
    id: 'amazon-no-sponsored',
    site: 'Amazon',
    sites: ['amazon.com', 'amazon.co.uk', 'amazon.de', 'amazon.fr', 'amazon.ca'],
    title: 'No sponsored results',
    hint: 'Hides paid placements in search results.',
    css: `[data-component-type="sp-sponsored-result"], .AdHolder, [cel_widget_id*="sponsored" i] { display: none !important; }`
  },
  {
    id: 'wiki-no-banners',
    site: 'Wikipedia',
    sites: ['wikipedia.org'],
    title: 'No banners',
    hint: 'Hides donation and notice banners.',
    css: `#centralNotice, #siteNotice, .frb { display: none !important; }`
  },
  {
    id: 'yt-no-related',
    site: 'YouTube',
    sites: ['youtube.com'],
    title: 'No suggestions beside videos',
    hint: 'Hides the list of other videos next to the one you’re watching.',
    css: `ytd-watch-flexy #secondary #related, ytd-watch-next-secondary-results-renderer { display: none !important; }`
  },
  {
    id: 'yt-no-home-feed',
    site: 'YouTube',
    sites: ['youtube.com'],
    title: 'No home page feed',
    hint: 'The home page shows just the search box, so you go for what you came for.',
    css: `ytd-browse[page-subtype="home"] ytd-rich-grid-renderer { display: none !important; }`
  },
  {
    id: 'yt-no-autoplay-overlay',
    site: 'YouTube',
    sites: ['youtube.com'],
    title: 'No “Up next” countdown',
    hint: 'Hides the countdown to the next video at the end of one.',
    css: `.ytp-autonav-endscreen-countdown-overlay, .ytp-upnext { display: none !important; }`
  },
  {
    id: 'google-no-ai',
    site: 'Google',
    sites: ['google.com', 'google.co.uk', 'google.pl', 'google.de', 'google.fr', 'google.ca'],
    title: 'No AI Overview',
    hint: 'Hides the AI summary above search results.',
    css: `#Odp5De, [data-mcpr], .YzCcne, div[jsname="dEwkXc"] { display: none !important; }`
  },
  {
    id: 'google-no-paa',
    site: 'Google',
    sites: ['google.com', 'google.co.uk', 'google.pl', 'google.de', 'google.fr', 'google.ca'],
    title: 'No “People also ask”',
    hint: 'Hides the box of related questions in results.',
    css: `[jsname="Cpkphb"], div.related-question-pair, [data-initq] { display: none !important; }`
  },
  {
    id: 'fb-no-reels',
    site: 'Facebook',
    sites: ['facebook.com'],
    title: 'No Reels',
    hint: 'Hides Reels and short videos from the feed.',
    css: `[aria-label="Reels"], [aria-label*="Reels and short videos" i] { display: none !important; }`
  },
  {
    id: 'fb-no-sponsored',
    site: 'Facebook',
    sites: ['facebook.com'],
    title: 'No sponsored side ads',
    hint: 'Hides the Sponsored column on the right.',
    css: `[data-pagelet="RightRail"] > div > div:first-child:has(a[href*="/ads/"]) { display: none !important; }`
  },
  {
    id: 'twitch-no-chat',
    site: 'Twitch',
    sites: ['twitch.tv'],
    title: 'No chat',
    hint: 'Hides the chat next to streams, so the video gets the room.',
    css: `.channel-root__right-column, .right-column { display: none !important; }`
  },
  {
    id: 'x-no-who-to-follow',
    site: 'X',
    sites: ['x.com', 'twitter.com'],
    title: 'No “Who to follow”',
    hint: 'Hides account suggestions.',
    css: `aside[aria-label="Who to follow"], [data-testid="sidebarColumn"] section:has(a[href*="/i/connect_people"]) { display: none !important; }`
  },
  {
    id: 'reddit-no-trending',
    site: 'Reddit',
    sites: ['reddit.com'],
    title: 'No trending searches',
    hint: 'Hides trending topics in the search box.',
    css: `faceplate-tracker[noun="trending"], #reddit-trending-searches-partial-container { display: none !important; }`
  },
  {
    id: 'amazon-no-video-ads',
    site: 'Amazon',
    sites: ['amazon.com', 'amazon.co.uk', 'amazon.de', 'amazon.fr', 'amazon.ca'],
    title: 'No video ads in results',
    hint: 'Hides the brand videos between search results.',
    css: `[cel_widget_id*="VIDEO" i], .sbv-video-single-product { display: none !important; }`
  },
  {
    id: 'wiki-wide',
    site: 'Wikipedia',
    sites: ['wikipedia.org'],
    title: 'Full-width articles',
    hint: 'Uses the whole window instead of a narrow column.',
    css: `.mw-page-container { max-width: none !important; } .vector-feature-limited-width-clientpref-1 .mw-body { max-width: none !important; }`
  }
]

export interface Elixir {
  id: string
  site: string
  sites: string[]
  title: string
  hint: string
  css: string
  /** #687 It hasn't found anything to hide for a while: the site may have changed. */
  broken?: boolean
}

export type WidgetId = 'weather' | 'todo' | 'news' | 'focus' | 'recent'

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
