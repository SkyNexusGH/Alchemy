import './pages.css'
import './settings.css'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  allEngines,
  baseColor,
  THEME_PRESETS,
  type CustomEngine,
  type FilterStatus,
  type UiFont,
  type Settings as S,
  type UpdateState,
  type Workspace
} from '@shared/types'
import { api } from '../lib/api'
import { inkOn } from '../lib/color'
import {
  Download,
  EngineIcon,
  Lock,
  Info,
  Layers,
  Gauge,
  LayoutGrid,
  Logo as LogoMark,
  Monitor,
  Moon,
  Palette,
  Pencil,
  Plus,
  Rocket,
  Search,
  Shield,
  Sidebar,
  Sun,
  Trash2,
  Upload,
  WorkspaceIcon,
  X,
  type Icon
} from '../lib/icons'
import { AccentPicker, WorkspaceIconPicker } from '../lib/pickers'
import { Select } from '../lib/Select'
import { presetThumb, saveAppearance, saveSettings, useSettings } from '../lib/settings'
import { BrandLogo, setPageIcon } from '../lib/ui'
import { hostOf } from '@shared/url'
import { ClearDataDialog } from './ClearDataDialog'

document.title = 'Settings'
setPageIcon('<polygon points="15.7,4.2 19.8,8.3 19.8,15.7 15.7,19.8 8.3,19.8 4.2,15.7 4.2,8.3 8.3,4.2"/><path d="M12 8.5l3.5 3.5-3.5 3.5L8.5 12z"/>')

type CategoryId = 'appearance' | 'newtab' | 'workspaces' | 'performance' | 'privacy' | 'adblock' | 'tabs' | 'downloads' | 'startup' | 'about'

const CATEGORIES: { id: CategoryId; label: string; icon: Icon }[] = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'newtab', label: 'New Tab & Search', icon: LayoutGrid },
  { id: 'workspaces', label: 'Workspaces', icon: Layers },
  { id: 'adblock', label: 'Ad blocking', icon: Shield },
  { id: 'privacy', label: 'Privacy', icon: Lock },
  { id: 'tabs', label: 'Tabs & sidebar', icon: Sidebar },
  { id: 'performance', label: 'Performance', icon: Gauge },
  { id: 'downloads', label: 'Downloads', icon: Download },
  { id: 'startup', label: 'Startup & import', icon: Rocket },
  { id: 'about', label: 'About Ovyra', icon: Info }
]

interface Row {
  category: CategoryId
  label: string
  hint?: string
  /** Extra words the search box should match. */
  keywords?: string
  /** Wide rows put their control under the label instead of beside it. */
  wide?: boolean
  control: ReactNode
}

export default function Settings(): React.JSX.Element {
  const s = useSettings((st) => st.settings)
  const [category, setCategory] = useState<CategoryId>(() => (location.hash.slice(1) as CategoryId) || 'appearance')
  const [query, setQuery] = useState('')
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    history.replaceState(null, '', `#${category}`)
  }, [category])

  const rows = useSettingRows(s, () => setClearing(true))
  const q = query.trim().toLowerCase()
  const matches = useMemo(
    () => (q ? rows.filter((r) => `${r.label} ${r.hint ?? ''} ${r.keywords ?? ''} ${r.category}`.toLowerCase().includes(q)) : []),
    [rows, q]
  )

  if (!s) return <div className="settings" />
  const current = CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0]

  return (
    <div className="settings">
      <nav className="set-nav">
        <div className="set-brand">
          <BrandLogo size={30} />
          <span>Settings</span>
        </div>
        <label className="set-search">
          <Search size={15} />
          <input placeholder="Search settings" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          {query && (
            <button onClick={() => setQuery('')} title="Clear search">
              <X size={13} />
            </button>
          )}
        </label>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            className={`set-cat${!q && c.id === current.id ? ' on' : ''}`}
            onClick={() => {
              setQuery('')
              setCategory(c.id)
            }}
          >
            <c.icon size={17} />
            {c.label}
          </button>
        ))}
      </nav>

      <main className="set-main">
        {q ? (
          <>
            <h1 className="set-title">Results for “{query.trim()}”</h1>
            {matches.length === 0 && <div className="set-empty">No settings match. Try a different word.</div>}
            {CATEGORIES.filter((c) => matches.some((m) => m.category === c.id)).map((c) => (
              <section key={c.id} className="set-group">
                <button
                  className="set-group-title"
                  onClick={() => {
                    setQuery('')
                    setCategory(c.id)
                  }}
                >
                  <c.icon size={14} /> {c.label}
                </button>
                <div className="set-card">
                  {matches
                    .filter((m) => m.category === c.id)
                    .map((r) => (
                      <SettingRow key={r.label} row={r} />
                    ))}
                </div>
              </section>
            ))}
          </>
        ) : (
          <>
            <h1 className="set-title">{current.label}</h1>
            {current.id === 'workspaces' ? (
              <WorkspacesSection settings={s} />
            ) : current.id === 'about' ? (
              <AboutSection />
            ) : (
              <div className="set-card">
                {rows
                  .filter((r) => r.category === current.id)
                  .map((r) => (
                    <SettingRow key={r.label} row={r} />
                  ))}
              </div>
            )}
          </>
        )}
      </main>
      {clearing && <ClearDataDialog onClose={() => setClearing(false)} />}
    </div>
  )
}

function SettingRow({ row }: { row: Row }): React.JSX.Element {
  return (
    <div className={`set-row${row.wide ? ' wide' : ''}`}>
      <div className="set-text">
        <div className="set-label">{row.label}</div>
        {row.hint && <div className="set-hint">{row.hint}</div>}
      </div>
      <div className="set-control">{row.control}</div>
    </div>
  )
}

export function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }): React.JSX.Element {
  return <button type="button" role="switch" aria-checked={on} className="switch" onClick={() => onChange(!on)} />
}

export function Segmented<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: { value: T; label: string; icon?: Icon }[]
  onChange: (v: T) => void
}): React.JSX.Element {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button type="button" key={o.value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.icon && <o.icon size={15} />}
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Background themes: a picture, its accent and the mode it was made for. */
export function ThemeGrid({ settings }: { settings: S }): React.JSX.Element {
  const a = settings.appearance
  return (
    <div className="theme-grid">
      {THEME_PRESETS.map((p) => {
        const thumb = presetThumb(p)
        return (
          <button
            type="button"
            key={p.id}
            className={`theme-card${a.background === p.id ? ' on' : ''}`}
            onClick={() => saveAppearance({ background: p.id, accent: p.accent, mode: p.mode })}
          >
            <span
              className="theme-thumb"
              style={thumb ? { backgroundImage: `url(${thumb})` } : { background: baseColor(p.mode, true) }}
            >
              <span className="theme-dot" style={{ background: p.accent }} />
            </span>
            <span className="theme-name">{p.name}</span>
          </button>
        )
      })}
      <button
        type="button"
        className={`theme-card${a.background === 'custom' ? ' on' : ''}`}
        onClick={() => void api.invoke('appearance:pickBackground')}
      >
        <span
          className="theme-thumb custom"
          style={a.customBackground ? { backgroundImage: `url(ovyra://assets/${a.customBackground})` } : undefined}
        >
          {!a.customBackground && <Upload size={20} />}
        </span>
        <span className="theme-name">{a.customBackground ? 'Your image' : 'Upload image'}</span>
      </button>
    </div>
  )
}

export function engineOptions(s: S): { value: string; label: string; icon: ReactNode }[] {
  return allEngines(s).map((e) => ({ value: e.id, label: e.name, icon: <EngineIcon id={e.id} size={16} /> }))
}

const FONTS: { value: UiFont; label: string; family: string }[] = [
  { value: 'inter', label: 'Inter', family: 'Inter Variable' },
  { value: 'segoe', label: 'Segoe UI (Windows)', family: 'Segoe UI Variable Text' },
  { value: 'nunito', label: 'Nunito (rounded)', family: 'Nunito Variable' },
  { value: 'outfit', label: 'Outfit (geometric)', family: 'Outfit Variable' },
  { value: 'grotesk', label: 'Space Grotesk', family: 'Space Grotesk Variable' },
  { value: 'mono', label: 'JetBrains Mono', family: 'JetBrains Mono Variable' }
]

function useSettingRows(s: S | null, onClear: () => void): Row[] {
  const [filters, setFilters] = useState<FilterStatus | null>(null)
  const [exceptions, setExceptions] = useState<string[]>([])
  const [stats, setStats] = useState<{ blocked: number; since: number } | null>(null)
  const [downloadsDir, setDownloadsDir] = useState('')
  const [usage, setUsage] = useState<{ memoryMB: number; tabs: number; sleeping: number; totalGB: number } | null>(null)
  // Whether the graphics card is in use right now (the setting applies after a restart).
  const [gpuNow, setGpuNow] = useState<boolean | null>(null)
  const [isDefault, setIsDefault] = useState<boolean | null>(null)

  useEffect(() => {
    const check = (): void => void api.invoke<{ isDefault: boolean }>('defaultbrowser:status').then((r) => setIsDefault(r.isDefault))
    check()
    // Coming back from Windows' Settings.
    window.addEventListener('focus', check)
    return () => window.removeEventListener('focus', check)
  }, [])

  useEffect(() => {
    const load = (): void => void api.invoke<typeof usage>('perf:usage').then(setUsage)
    load()
    const id = setInterval(load, 3000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    api.invoke<FilterStatus>('filters:status').then(setFilters)
    api.invoke<string[]>('shields:exceptions').then(setExceptions)
    api.invoke<{ blocked: number; since: number }>('shields:stats').then(setStats)
    api.invoke<{ downloads: string; gpu: boolean }>('app:info').then((i) => {
      setDownloadsDir(i.downloads)
      setGpuNow(i.gpu)
    })
    const off1 = api.on('filters', setFilters)
    const off2 = api.on('shields:exceptions', setExceptions)
    return () => {
      off1()
      off2()
    }
  }, [])

  if (!s) return []
  const set = (patch: Partial<S>): void => void saveSettings(patch)
  const perf = s.performance
  const setPerf = (patch: Partial<S['performance']>): void => set({ performance: { ...perf, ...patch } })
  const a = s.appearance
  const listsLine = !filters
    ? ''
    : filters.updating
      ? 'Updating filter lists…'
      : filters.error && !filters.ready
        ? `Couldn't download filter lists: ${filters.error}`
        : `${filters.lists} uBlock Origin–compatible lists${filters.updated ? ` · updated ${ago(filters.updated)}` : ''}`

  return [
    // ---- appearance ----
    {
      category: 'appearance',
      label: 'Mode',
      hint: 'Ovyra is the navy look; Dark is true black.',
      keywords: 'dark light theme system night black navy ovyra oled',
      wide: true,
      control: (
        <Segmented
          value={a.mode}
          onChange={(mode) => saveAppearance({ mode })}
          options={[
            { value: 'light', label: 'Light', icon: Sun },
            { value: 'ovyra', label: 'Ovyra', icon: LogoMark },
            { value: 'dark', label: 'Dark', icon: Moon },
            { value: 'system', label: 'System', icon: Monitor }
          ]}
        />
      )
    },
    {
      category: 'appearance',
      label: 'Theme',
      hint: 'A background with matching colors. Picking one also sets the accent and mode.',
      keywords: 'background wallpaper image picture theme',
      wide: true,
      control: <ThemeGrid settings={s} />
    },
    {
      category: 'appearance',
      label: 'Accent color',
      hint: 'Used for highlights, the active tab and buttons. Workspaces can have their own.',
      keywords: 'color colour highlight',
      wide: true,
      control: <AccentPicker value={a.accent} onChange={(accent) => accent && saveAppearance({ accent })} />
    },
    {
      category: 'appearance',
      label: 'Background dimming',
      hint: 'Darkens (or lightens) the background so text stays readable.',
      keywords: 'wallpaper brightness',
      control: (
        <div className="range">
          <input
            type="range"
            min={0}
            max={70}
            value={a.backgroundDim}
            onChange={(e) => saveAppearance({ backgroundDim: Number(e.target.value) })}
          />
          <span>{a.backgroundDim}%</span>
        </div>
      )
    },
    {
      category: 'appearance',
      label: 'Corners',
      keywords: 'rounded radius shape',
      control: (
        <Segmented
          value={a.roundness}
          onChange={(roundness) => saveAppearance({ roundness })}
          options={[
            { value: 'sharp', label: 'Sharp' },
            { value: 'normal', label: 'Normal' },
            { value: 'round', label: 'Round' }
          ]}
        />
      )
    },
    {
      category: 'appearance',
      label: 'Interface font',
      hint: 'The font used for tabs, menus and Ovyra’s own pages.',
      keywords: 'typeface text letters',
      control: (
        <Select
          value={a.font}
          width={220}
          onChange={(font) => saveAppearance({ font })}
          options={FONTS.map((f) => ({
            value: f.value,
            label: f.label,
            icon: <span style={{ fontFamily: f.family, fontWeight: 600 }}>Aa</span>
          }))}
        />
      )
    },
    {
      category: 'appearance',
      label: 'Compact tabs',
      hint: 'Smaller tabs, so more fit across the top.',
      keywords: 'density small',
      control: <Switch on={a.compactTabs} onChange={(compactTabs) => saveAppearance({ compactTabs })} />
    },
    {
      category: 'appearance',
      label: 'Show bookmarks bar',
      hint: 'Ctrl+Shift+B. Appears once you have bookmarks on it.',
      control: <Switch on={s.showBookmarksBar} onChange={(v) => set({ showBookmarksBar: v })} />
    },

    // ---- new tab ----
    {
      category: 'newtab',
      label: 'Show the clock',
      control: <Switch on={a.showClock} onChange={(showClock) => saveAppearance({ showClock })} />
    },
    {
      category: 'newtab',
      label: 'Show the search box',
      control: <Switch on={a.showSearch} onChange={(showSearch) => saveAppearance({ showSearch })} />
    },
    {
      category: 'newtab',
      label: 'Show Home zone',
      keywords: 'tiles shortcuts sites speed dial',
      control: <Switch on={a.showSpeedDial} onChange={(showSpeedDial) => saveAppearance({ showSpeedDial })} />
    },
    {
      category: 'newtab',
      label: 'Search engine',
      hint: 'Used by the address bar and the new tab page.',
      control: <Select value={s.searchEngine} options={engineOptions(s)} onChange={(v) => set({ searchEngine: v })} width={220} />
    },
    {
      category: 'newtab',
      label: 'Search shortcuts',
      hint: 'Type a keyword in the address bar and press Tab to search that site, like “yt” then Tab for YouTube.',
      keywords: 'custom search engine keyword tab youtube wikipedia',
      wide: true,
      control: <EnginesEditor settings={s} />
    },
    {
      category: 'newtab',
      label: 'Search suggestions',
      hint: 'Send what you type to your search engine for suggestions (without cookies).',
      control: <Switch on={s.searchSuggestions} onChange={(v) => set({ searchSuggestions: v })} />
    },

    // ---- ad blocking ----
    {
      category: 'adblock',
      label: 'Block ads and trackers',
      hint: listsLine,
      keywords: 'adblock ublock shield filter',
      control: (
        <div className="row-actions">
          {/* Lists update by themselves every day; the button only shows when that fell behind. */}
          {s.adblock && filters && (filters.updating || filters.error || !filters.updated || Date.now() - filters.updated > 26 * 3600_000) ? (
            <button className="btn small" disabled={filters.updating} onClick={() => api.invoke('filters:update')}>
              {filters.updating ? 'Updating…' : 'Update now'}
            </button>
          ) : (
            s.adblock && filters?.ready && <span className="good">Up to date</span>
          )}
          <Switch on={s.adblock} onChange={(v) => set({ adblock: v })} />
        </div>
      )
    },
    {
      category: 'adblock',
      label: 'Hide cookie banners',
      hint: 'Removes “accept cookies” popups using uBlock’s annoyance lists.',
      control: <Switch on={s.blockCookieBanners} onChange={(v) => set({ blockCookieBanners: v })} />
    },
    {
      category: 'adblock',
      label: 'Blocked so far',
      hint: stats ? `Since ${new Date(stats.since).toLocaleDateString([], { month: 'long', day: 'numeric' })}` : '',
      keywords: 'stats count',
      control: (
        <span className="stat-number">
          {(stats?.blocked ?? 0).toLocaleString()}
          <small>~{Math.max(0, Math.round(((stats?.blocked ?? 0) * 0.05) / 60))} min saved</small>
        </span>
      )
    },
    ...(exceptions.length
      ? [
          {
            category: 'adblock' as const,
            label: 'Sites with protections off',
            hint: 'Turned off from the shield in the address bar.',
            wide: true,
            control: (
              <div className="chips">
                {exceptions.map((site) => (
                  <button key={site} className="chip" title="Turn protections back on" onClick={() => api.invoke('shields:set', site, true)}>
                    {site} <X size={12} />
                  </button>
                ))}
              </div>
            )
          }
        ]
      : []),

    // ---- privacy ----
    {
      category: 'privacy',
      label: 'Block third-party cookies',
      hint: 'Stops companies following you across sites. A few embedded logins may need protections off for that site.',
      control: <Switch on={s.blockThirdPartyCookies} onChange={(v) => set({ blockThirdPartyCookies: v })} />
    },
    {
      category: 'privacy',
      label: 'Fingerprinting protection',
      hint: 'Adds invisible noise to canvas, audio and graphics readouts so sites can’t identify your device.',
      control: <Switch on={s.fingerprintProtection} onChange={(v) => set({ fingerprintProtection: v })} />
    },
    {
      category: 'privacy',
      label: 'Always use secure connections',
      hint: 'Upgrades sites to HTTPS, and falls back only if a site doesn’t support it.',
      keywords: 'https ssl',
      control: <Switch on={s.httpsUpgrade} onChange={(v) => set({ httpsUpgrade: v })} />
    },
    {
      category: 'privacy',
      label: 'Send Global Privacy Control',
      hint: 'Tells sites not to sell or share your data.',
      keywords: 'gpc do not track dnt',
      control: <Switch on={s.sendGpc} onChange={(v) => set({ sendGpc: v })} />
    },
    {
      category: 'privacy',
      label: 'Clear browsing data',
      hint: 'History, cookies, cache, permissions.',
      keywords: 'delete history cookies cache',
      control: (
        <button className="btn small" onClick={onClear}>
          <Trash2 size={13} /> Clear…
        </button>
      )
    },
    {
      category: 'privacy',
      label: 'Telemetry',
      hint: 'Ovyra never sends usage data anywhere.',
      control: <span className="good">None, ever</span>
    },

    // ---- performance ----
    {
      category: 'performance',
      label: 'Heavy Mode',
      hint: 'Give Ovyra more of your computer: tabs and panels never sleep or slow down in the background, and pages may use more memory. Uses more RAM and battery.',
      keywords: 'performance speed ram memory power gaming fast',
      control: <Switch on={perf.heavy} onChange={(heavy) => setPerf({ heavy })} />
    },
    ...(perf.heavy
      ? [
          {
            category: 'performance' as const,
            label: 'Memory per page',
            hint: 'How much JavaScript memory a single page may use. Applies after you restart Ovyra.',
            keywords: 'heap ram v8',
            control: (
              <Segmented
                value={String(perf.pageMemoryMB)}
                onChange={(v) => setPerf({ pageMemoryMB: Number(v) })}
                options={[2048, 4096, 8192, 16384]
                  .filter((mb) => mb / 1024 <= Math.max(2, usage?.totalGB ?? 16) / 2)
                  .map((mb) => ({ value: String(mb), label: `${mb / 1024} GB` }))}
              />
            )
          }
        ]
      : []),
    {
      category: 'performance',
      label: 'RAM limit',
      hint: 'When Ovyra uses more than this, the tabs you haven’t used for the longest go to sleep. Playing tabs never do.',
      keywords: 'memory ram limit budget cap',
      wide: true,
      control: (
        <div className="range">
          <input
            type="range"
            min={0}
            max={Math.max(2, Math.floor(usage?.totalGB ?? 16))}
            value={perf.ramLimitGB}
            onChange={(e) => setPerf({ ramLimitGB: Number(e.target.value) })}
          />
          <span style={{ minWidth: 72 }}>{perf.ramLimitGB ? `${perf.ramLimitGB} GB` : 'No limit'}</span>
        </div>
      )
    },
    {
      category: 'performance',
      label: 'Right now',
      hint: usage ? `Your computer has ${usage.totalGB} GB of RAM.` : undefined,
      keywords: 'usage memory task manager',
      control: usage ? (
        <span className="good">
          {(usage.memoryMB / 1024).toFixed(1)} GB · {usage.tabs} tab{usage.tabs === 1 ? '' : 's'}
          {usage.sleeping ? ` (${usage.sleeping} asleep)` : ''}
        </span>
      ) : null
    },

    {
      category: 'performance',
      label: 'Network limiter',
      hint: 'Caps how fast Ovyra downloads and uploads, so games, calls and other apps keep their share of your connection.',
      keywords: 'bandwidth internet speed limit throttle download upload gaming',
      control: (
        <Select
          value={perf.networkLimitMbps}
          width={190}
          onChange={(networkLimitMbps) => setPerf({ networkLimitMbps })}
          options={[
            { value: 0, label: 'No limit' },
            { value: 1, label: '1 Mbit/s' },
            { value: 5, label: '5 Mbit/s' },
            { value: 10, label: '10 Mbit/s' },
            { value: 25, label: '25 Mbit/s' },
            { value: 50, label: '50 Mbit/s' },
            { value: 100, label: '100 Mbit/s' }
          ]}
        />
      )
    },
    {
      category: 'performance',
      label: 'Keep these sites awake',
      hint: 'Their tabs never go to sleep. You can also right-click a tab and choose Keep awake.',
      keywords: 'never sleep always awake exceptions music',
      wide: true,
      control: <AwakeSites sites={perf.awakeSites} onChange={(awakeSites) => setPerf({ awakeSites })} />
    },
    {
      category: 'performance',
      label: 'Use graphics acceleration',
      hint:
        gpuNow !== null && gpuNow !== perf.hardwareAcceleration
          ? 'Restart Ovyra to apply this change.'
          : 'Draws pages with your graphics card. Turn off if videos flicker or pages show glitches.',
      keywords: 'hardware acceleration gpu graphics card flicker',
      control: (
        <div className="row-actions">
          {gpuNow !== null && gpuNow !== perf.hardwareAcceleration && (
            <button className="btn small" onClick={() => api.invoke('app:restart')}>
              Restart now
            </button>
          )}
          <Switch on={perf.hardwareAcceleration} onChange={(hardwareAcceleration) => setPerf({ hardwareAcceleration })} />
        </div>
      )
    },

    // ---- tabs & sidebar ----
    {
      category: 'tabs',
      label: 'Sleeping tabs',
      hint: 'Unloads background tabs you haven’t looked at in a while to free memory. Pinned and playing tabs never sleep (and nothing sleeps in Heavy Mode).',
      keywords: 'memory ram performance',
      control: (
        <Select
          value={s.sleepAfterMinutes}
          width={190}
          onChange={(v) => set({ sleepAfterMinutes: v })}
          options={[
            { value: 0, label: 'Never' },
            { value: 5, label: 'After 5 minutes' },
            { value: 15, label: 'After 15 minutes' },
            { value: 30, label: 'After 30 minutes' },
            { value: 60, label: 'After 1 hour' },
            { value: 180, label: 'After 3 hours' }
          ]}
        />
      )
    },
    {
      category: 'tabs',
      label: 'Tab islands',
      hint: 'Tabs you open from a page are grouped with it.',
      keywords: 'groups',
      control: <Switch on={s.tabIslands} onChange={(v) => set({ tabIslands: v })} />
    },
    {
      category: 'tabs',
      label: 'Video popout',
      hint: 'A “Pop out” button on videos that floats them above other windows.',
      keywords: 'picture in picture pip',
      control: <Switch on={s.videoPopout} onChange={(v) => set({ videoPopout: v })} />
    },
    {
      category: 'tabs',
      label: 'Pop out videos automatically',
      hint: 'When you switch away from a tab playing a video, it keeps playing in a floating window, and goes back when you return.',
      keywords: 'picture in picture pip auto float',
      control: <Switch on={s.autoPopout} onChange={(v) => set({ autoPopout: v })} />
    },
    {
      category: 'tabs',
      label: 'Unload closed sidebar panels',
      hint: 'Frees memory when a messenger hasn’t been opened for a while.',
      keywords: 'messenger whatsapp discord memory notifications',
      control: (
        <Select
          value={s.panelSleepMinutes}
          width={220}
          onChange={(v) => set({ panelSleepMinutes: v })}
          options={[
            { value: 0, label: 'Never', hint: 'Always get notifications' },
            { value: 10, label: 'After 10 minutes' },
            { value: 30, label: 'After 30 minutes' },
            { value: 120, label: 'After 2 hours' }
          ]}
        />
      )
    },

    // ---- downloads ----
    {
      category: 'downloads',
      label: 'Save files to',
      hint: s.downloadDir ?? downloadsDir,
      keywords: 'folder location',
      control: (
        <div className="row-actions">
          {s.downloadDir && (
            <button className="btn small" onClick={() => set({ downloadDir: null })}>
              Reset
            </button>
          )}
          <button
            className="btn small"
            onClick={async () => {
              const dir = await api.invoke<string | null>('dialog:pickFolder')
              if (dir) set({ downloadDir: dir })
            }}
          >
            Change…
          </button>
        </div>
      )
    },
    {
      category: 'downloads',
      label: 'Ask where to save each file',
      control: <Switch on={s.askWhereToSave} onChange={(v) => set({ askWhereToSave: v })} />
    },

    // ---- startup & import ----
    {
      category: 'startup',
      label: 'When Ovyra starts',
      control: (
        <Select
          value={s.startup}
          width={230}
          onChange={(v) => set({ startup: v })}
          options={[
            { value: 'restore', label: 'Continue where you left off' },
            { value: 'newtab', label: 'Open a new tab' }
          ]}
        />
      )
    },
    {
      category: 'startup',
      label: 'Default browser',
      hint: isDefault
        ? 'Links you open in other apps open in Ovyra.'
        : 'Open links from other apps in Ovyra. Windows asks you to confirm in its Settings.',
      keywords: 'default browser links windows',
      control: isDefault ? (
        <span className="good">Ovyra is your default</span>
      ) : (
        <button className="btn small" onClick={() => api.invoke('defaultbrowser:open')}>
          Make default…
        </button>
      )
    },
    {
      category: 'startup',
      label: 'Ask to be the default browser',
      hint: 'Shows a reminder on the new tab page while Ovyra isn’t the default.',
      control: <Switch on={s.askDefaultBrowser} onChange={(v) => set({ askDefaultBrowser: v })} />
    },
    {
      category: 'startup',
      label: 'Import from another browser',
      hint: 'Bookmarks, history and Opera’s speed dial. Nothing is uploaded.',
      keywords: 'opera brave chrome edge bookmarks',
      wide: true,
      control: <ImportButtons />
    },
    {
      category: 'startup',
      label: 'Setup guide',
      hint: 'Walk through the first-run setup again.',
      keywords: 'wizard welcome onboarding',
      control: (
        <button className="btn small" onClick={() => api.invoke('internal:open', 'welcome')}>
          Open setup
        </button>
      )
    }
  ]
}

function ago(time: number): string {
  const min = Math.round((Date.now() - time) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} days ago`
}

// ---- workspaces ------------------------------------------------------------------------

function WorkspacesSection({ settings }: { settings: S }): React.JSX.Element {
  const [editing, setEditing] = useState<Workspace | null>(null)
  return (
    <>
      <p className="set-intro">
        Each workspace keeps its own tabs and can have its own color. Switch between them from the top of the sidebar.
      </p>
      <div className="set-card">
        {settings.workspaces.map((w) => {
          const accent = w.accent ?? settings.appearance.accent
          return (
            <div key={w.id} className="set-row">
              <span className="ws-chip" style={{ background: accent, color: inkOn(accent) }}>
                {w.icon ? <WorkspaceIcon id={w.icon} size={17} /> : w.name.charAt(0).toUpperCase()}
              </span>
              <div className="set-text">
                <div className="set-label">{w.name}</div>
                <div className="set-hint">{w.accent ? 'Own color' : 'Uses the browser accent'}</div>
              </div>
              <div className="row-actions">
                <button className="btn small" onClick={() => setEditing(w)}>
                  <Pencil size={13} /> Edit
                </button>
                {settings.workspaces.length > 1 && (
                  <button className="icon-btn" title="Delete" onClick={() => api.invoke('workspace:delete', w.id)}>
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <button className="btn" style={{ marginTop: 14 }} onClick={() => setEditing({ id: '', name: '', icon: 'work', accent: null })}>
        <Plus size={15} /> New workspace
      </button>
      {editing && <WorkspaceDialog ws={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function WorkspaceDialog({ ws, onClose }: { ws: Workspace; onClose: () => void }): React.JSX.Element {
  const [w, setW] = useState(ws)
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="modal"
        style={{ width: 'min(460px, calc(100vw - 32px))' }}
        onSubmit={async (e) => {
          e.preventDefault()
          await api.invoke('workspace:save', { ...w, name: w.name || 'Workspace' })
          onClose()
        }}
      >
        <h2>{ws.id ? 'Edit workspace' : 'New workspace'}</h2>
        <div className="stack" style={{ marginTop: 14 }}>
          <input className="field" autoFocus placeholder="Name" value={w.name} onChange={(e) => setW({ ...w, name: e.target.value })} />
          <div className="set-hint">Icon</div>
          <WorkspaceIconPicker value={w.icon} name={w.name} onChange={(icon) => setW({ ...w, icon })} />
          <div className="set-hint">Color</div>
          <AccentPicker value={w.accent} allowDefault onChange={(accent) => setW({ ...w, accent })} size={24} />
        </div>
        <div className="buttons">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            Save
          </button>
        </div>
      </form>
    </div>
  )
}

// ---- import ------------------------------------------------------------------------------

interface ImportSource {
  id: string
  name: string
  hasBookmarks: boolean
  hasHistory: boolean
  hasSpeedDial: boolean
}

export function ImportButtons(): React.JSX.Element {
  const [sources, setSources] = useState<ImportSource[]>([])
  const [picked, setPicked] = useState<ImportSource | null>(null)
  const [done, setDone] = useState<Record<string, string>>({})
  useEffect(() => void api.invoke<ImportSource[]>('import:sources').then(setSources), [])
  if (!sources.length) return <span className="set-hint">No other browsers found on this PC.</span>

  return (
    <div>
      <div className="chips">
        {sources.map((src) => (
          <button key={src.id} className="btn small" onClick={() => setPicked(src)}>
            {done[src.id] ? `✓ ${src.name}` : `From ${src.name}`}
          </button>
        ))}
      </div>
      {Object.values(done).map((msg) => (
        <div key={msg} className="set-hint good" style={{ marginTop: 8 }}>
          {msg}
        </div>
      ))}
      {picked && (
        <ImportDialog
          source={picked}
          onClose={(msg) => {
            if (msg) setDone({ ...done, [picked.id]: msg })
            setPicked(null)
          }}
        />
      )}
    </div>
  )
}

function ImportDialog({ source, onClose }: { source: ImportSource; onClose: (msg?: string) => void }): React.JSX.Element {
  const [what, setWhat] = useState({ bookmarks: source.hasBookmarks, history: source.hasHistory, speedDial: source.hasSpeedDial })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const options = [
    { key: 'bookmarks', label: 'Bookmarks', show: source.hasBookmarks },
    { key: 'speedDial', label: 'Speed dial → Home zone', show: source.hasSpeedDial },
    { key: 'history', label: 'Browsing history', show: source.hasHistory }
  ] as const

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal" role="dialog" aria-modal>
        <h2>Import from {source.name}</h2>
        <p>Your {source.name} data stays where it is; Ovyra gets a copy.</p>
        {options
          .filter((o) => o.show)
          .map((o) => (
            <label key={o.key} className="check">
              <Switch on={what[o.key]} onChange={(v) => setWhat({ ...what, [o.key]: v })} />
              {o.label}
            </label>
          ))}
        {error && <p style={{ color: 'var(--danger)', margin: '10px 0 0' }}>{error}</p>}
        <div className="buttons">
          <button className="btn" disabled={busy} onClick={() => onClose()}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={busy || !Object.values(what).some(Boolean)}
            onClick={async () => {
              setBusy(true)
              try {
                const r = await api.invoke<{ bookmarks: number; history: number; speedDial: number }>('import:run', source.id, what)
                onClose(
                  `Imported from ${source.name}: ${r.bookmarks} bookmarks, ${r.speedDial} Home zone sites, ${r.history.toLocaleString()} history pages.`
                )
              } catch (e) {
                setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': /, '') : String(e))
                setBusy(false)
              }
            }}
          >
            {busy ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- about --------------------------------------------------------------------------------

interface Info {
  version: string
  chrome: string
  electron: string
}

/** The user's search shortcuts: name, keyword and address. */
function EnginesEditor({ settings }: { settings: S }): React.JSX.Element {
  const [draft, setDraft] = useState({ name: '', keyword: '', search: '' })
  const list = settings.customEngines
  const save = (customEngines: CustomEngine[]): void => void saveSettings({ customEngines })
  const engines = allEngines(settings)
  const keyword = draft.keyword.trim()
  const taken = !!keyword && engines.some((e) => e.keyword.toLowerCase() === keyword.toLowerCase())
  const search = draft.search.trim()
  const valid = !!draft.name.trim() && !!keyword && !/\s/.test(keyword) && !taken && /^https?:\/\/.+%s/.test(search)

  return (
    <div className="engines">
      {list.map((e) => (
        <div key={e.id} className="engine-row">
          <EngineIcon id={e.id} size={16} />
          <span className="engine-name">{e.name}</span>
          <kbd>{e.keyword}</kbd>
          <span className="engine-url">{e.search}</span>
          <button
            className="icon-btn"
            title={`Remove ${e.name}`}
            onClick={() => {
              save(list.filter((x) => x.id !== e.id))
              if (settings.searchEngine === e.id) void saveSettings({ searchEngine: 'google' })
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <form
        className="engine-row add"
        onSubmit={(ev) => {
          ev.preventDefault()
          if (!valid) return
          save([...list, { id: crypto.randomUUID(), name: draft.name.trim(), keyword, search }])
          setDraft({ name: '', keyword: '', search: '' })
        }}
      >
        <input className="field" placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <input className="field kw" placeholder="Keyword" value={draft.keyword} onChange={(e) => setDraft({ ...draft, keyword: e.target.value })} />
        <input
          className="field url"
          placeholder="https://example.com/search?q=%s"
          value={draft.search}
          onChange={(e) => setDraft({ ...draft, search: e.target.value })}
        />
        <button className="btn small" disabled={!valid} title="%s marks where your search goes">
          <Plus size={13} /> Add
        </button>
      </form>
      <div className="set-hint">
        {taken
          ? 'That keyword is already used.'
          : `Built in: ${engines
              .filter((e) => !e.custom)
              .map((e) => `${e.name} (${e.keyword})`)
              .join(' · ')}`}
      </div>
    </div>
  )
}

function AwakeSites({ sites, onChange }: { sites: string[]; onChange: (s: string[]) => void }): React.JSX.Element {
  const [text, setText] = useState('')
  return (
    <div className="chips">
      {sites.map((site) => (
        <button key={site} className="chip" title="Let this site sleep again" onClick={() => onChange(sites.filter((x) => x !== site))}>
          {site} <X size={12} />
        </button>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const t = text.trim()
          const host = hostOf(t.includes('://') ? t : `https://${t}`)
          if (host && !sites.includes(host)) onChange([...sites, host])
          setText('')
        }}
      >
        <input
          className="field chip-input"
          placeholder="Add a site, like music.youtube.com"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </form>
    </div>
  )
}

function AboutSection(): React.JSX.Element {
  const [info, setInfo] = useState<Info | null>(null)
  useEffect(() => void api.invoke<Info>('app:info').then(setInfo), [])
  return (
    <>
      <div className="set-card about">
        <BrandLogo size={72} />
        <div>
          <div className="about-name">Ovyra {info?.version}</div>
          <div className="set-hint">
            Chromium {info?.chrome} · Electron {info?.electron}
          </div>
        </div>
      </div>
      <div className="set-card" style={{ marginTop: 14 }}>
        <div className="set-row">
          <div className="set-text">
            <div className="set-label">Updates</div>
            <div className="set-hint">New versions download in the background and install when you restart.</div>
          </div>
          <div className="set-control">
            <UpdateStatus />
          </div>
        </div>
        <div className="set-row">
          <div className="set-text">
            <div className="set-label">What’s new</div>
            <div className="set-hint">See what changed in this version.</div>
          </div>
          <div className="set-control">
            <button className="btn small" onClick={() => api.invoke('internal:open', 'whatsnew')}>
              Open
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function UpdateStatus(): React.JSX.Element {
  const [u, setU] = useState<UpdateState | null>(null)
  useEffect(() => {
    api.invoke<UpdateState>('update:state').then(setU)
    return api.on('update', setU)
  }, [])
  if (!u) return <span />
  const text = {
    disabled: 'Off in development builds',
    idle: '',
    checking: 'Checking…',
    downloading: `Downloading ${u.version ?? 'update'}… ${u.percent ?? 0}%`,
    ready: `Version ${u.version} is ready`,
    latest: 'Up to date',
    error: "Couldn't check"
  }[u.status]
  return (
    <div className="row-actions">
      <span className={`set-hint${u.status === 'ready' || u.status === 'latest' ? ' good' : ''}`} style={{ marginTop: 0 }} title={u.error}>
        {text}
      </span>
      {u.status === 'ready' ? (
        <button className="btn small primary" onClick={() => api.invoke('update:install')}>
          Restart to update
        </button>
      ) : (
        <button
          className="btn small"
          disabled={u.status === 'disabled' || u.status === 'checking' || u.status === 'downloading'}
          onClick={() => api.invoke('update:check')}
        >
          Check for updates
        </button>
      )}
    </div>
  )
}
