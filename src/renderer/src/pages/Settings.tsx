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
  type Workspace,
  type AegisStats
} from '@shared/types'
import { CompanyBubbles, SavedTiles, TopSites, WeekChart } from './AegisStats'
import { api } from '../lib/api'
import { inkOn } from '../lib/color'
import {
  Check,
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
import { BrandLogo, Favicon, setPageIcon } from '../lib/ui'
import { hostOf } from '@shared/url'
import { ClearDataDialog } from './ClearDataDialog'

document.title = 'Settings'
setPageIcon('<polygon points="15.7,4.2 19.8,8.3 19.8,15.7 15.7,19.8 8.3,19.8 4.2,15.7 4.2,8.3 8.3,4.2"/><path d="M12 8.5l3.5 3.5-3.5 3.5L8.5 12z"/>')

type CategoryId = 'appearance' | 'newtab' | 'workspaces' | 'performance' | 'privacy' | 'adblock' | 'tabs' | 'downloads' | 'startup' | 'about'

const CATEGORIES: { id: CategoryId; label: string; icon: Icon }[] = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'newtab', label: 'New Tab & Search', icon: LayoutGrid },
  { id: 'workspaces', label: 'Workspaces', icon: Layers },
  { id: 'adblock', label: 'Aegis blocker', icon: Shield },
  { id: 'privacy', label: 'Privacy', icon: Lock },
  { id: 'tabs', label: 'Tabs & sidebar', icon: Sidebar },
  { id: 'performance', label: 'Performance', icon: Gauge },
  { id: 'downloads', label: 'Downloads', icon: Download },
  { id: 'startup', label: 'Startup & import', icon: Rocket },
  { id: 'about', label: 'About Alchemy', icon: Info }
]

interface Row {
  category: CategoryId
  label: string
  hint?: string
  /** Extra words the search box should match. */
  keywords?: string
  /** Wide rows put their control under the label instead of beside it. */
  wide?: boolean
  /** A heading inside the page; rows that share one are shown together under it. */
  group?: string
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

  if (!s)
    return (
      <div className="settings">
        <nav className="set-nav">
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} className="shimmer" style={{ height: 30, marginBottom: 6 }} />
          ))}
        </nav>
        <main className="set-main">
          <span className="shimmer" style={{ display: 'block', width: 180, height: 26, marginBottom: 22 }} />
          <span className="shimmer" style={{ display: 'block', height: 320, borderRadius: 14 }} />
        </main>
      </div>
    )
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
              <GroupedRows rows={rows.filter((r) => r.category === current.id)} />
            )}
          </>
        )}
      </main>
      {clearing && <ClearDataDialog onClose={() => setClearing(false)} />}
    </div>
  )
}

/** A page's rows in one card, or one card per group, each under its heading. */
function GroupedRows({ rows }: { rows: Row[] }): React.JSX.Element {
  const groups: { name?: string; rows: Row[] }[] = []
  for (const r of rows) {
    const last = groups[groups.length - 1]
    if (last && last.name === r.group) last.rows.push(r)
    else groups.push({ name: r.group, rows: [r] })
  }
  return (
    <>
      {groups.map((g, i) => (
        <section key={g.name ?? i} className="set-section">
          {g.name && <h2 className="set-subhead">{g.name}</h2>}
          <div className="set-card">
            {g.rows.map((r) => (
              <SettingRow key={r.label} row={r} />
            ))}
          </div>
        </section>
      ))}
    </>
  )
}

function FeedsEditor({ feeds, onSave }: { feeds: string[]; onSave: (feeds: string[]) => void }): React.JSX.Element {
  const [text, setText] = useState(feeds.join('\n'))
  const clean = text
    .split(/\s+/)
    .map((l) => l.trim())
    .filter((l) => /^https?:\/\//.test(l))
  const changed = clean.join('|') !== feeds.join('|')
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <textarea className="field" rows={4} value={text} spellCheck={false} onChange={(e) => setText(e.target.value)} style={{ fontFamily: 'var(--mono, monospace)', fontSize: 12 }} />
      {changed && (
        <button className="btn small primary" style={{ justifySelf: 'start' }} onClick={() => onSave(clean)}>
          Save feeds
        </button>
      )}
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
              {a.background === p.id && (
                <span className="theme-check">
                  <Check size={12} strokeWidth={3} />
                </span>
              )}
            </span>
            <span className="theme-name">
              <span className="theme-swatch" style={{ background: p.accent }} title="Accent color for this theme" />
              {p.name}
            </span>
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
          style={a.customBackground ? { backgroundImage: `url(alchemy://assets/${a.customBackground})` } : undefined}
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
  const [stats, setStats] = useState<AegisStats | null>(null)
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
    api.invoke<AegisStats>('shields:stats').then(setStats)
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
      hint: 'Alchemy is the navy look; Dark is true black.',
      keywords: 'dark light theme system night black navy ovyra oled',
      wide: true,
      control: (
        <Segmented
          value={a.mode}
          onChange={(mode) => saveAppearance({ mode })}
          options={[
            { value: 'light', label: 'Light', icon: Sun },
            { value: 'ovyra', label: 'Alchemy', icon: LogoMark },
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
      control: <AccentPicker size={30} value={a.accent} onChange={(accent) => accent && saveAppearance({ accent })} />
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
      label: 'High contrast',
      hint: 'Stronger text, borders and focus outlines, for bright rooms and easier reading.',
      keywords: 'accessibility contrast readable vision',
      control: <Switch on={!!a.highContrast} onChange={(highContrast) => saveAppearance({ highContrast })} />
    },
    {
      category: 'appearance',
      label: 'Window material',
      hint:
        a.material === 'mica'
          ? 'Mica: the tabs and toolbar softly take on your desktop’s colours (Windows 11).'
          : a.material === 'acrylic'
            ? 'Acrylic: the tabs and toolbar are see-through and blurred, showing what’s behind the window (Windows 11).'
            : a.material === 'glass'
              ? 'Frosted glass: your new tab wallpaper, blurred, behind the tabs and toolbar.'
              : 'Solid colours.',
      keywords: 'mica acrylic frosted glass blur transparent material windows 11',
      control: (
        <Segmented
          value={a.material ?? 'solid'}
          options={[
            { value: 'solid', label: 'Solid' },
            { value: 'mica', label: 'Mica' },
            { value: 'acrylic', label: 'Acrylic' },
            { value: 'glass', label: 'Frosted glass' }
          ]}
          onChange={(material) => saveAppearance({ material })}
        />
      )
    },
    {
      category: 'appearance',
      label: 'Site-tinted toolbar',
      hint: 'The toolbar takes on a hint of the colour of the site you’re on, when the site has one.',
      keywords: 'tint site colour color toolbar theme-color',
      control: <Switch on={!!a.siteTint} onChange={(siteTint) => saveAppearance({ siteTint })} />
    },
    {
      category: 'appearance',
      label: 'Icons',
      hint: 'Runes swaps many icons for Elder Futhark runes picked for their meaning: othala for home, algiz for the shield, jera for reload.',
      keywords: 'icons runes rune futhark magic icon set',
      control: (
        <Segmented
          value={a.iconSet ?? 'standard'}
          options={[
            { value: 'standard', label: 'Standard' },
            { value: 'runes', label: 'Runes ᛟ' }
          ]}
          onChange={(iconSet) => saveAppearance({ iconSet })}
        />
      )
    },
    {
      category: 'appearance',
      label: 'Reduce motion',
      hint: 'Turns off popping tabs, springy menus, ripples, confetti and other movement. Things just appear.',
      keywords: 'animation motion accessibility calm reduce',
      control: <Switch on={!!a.reduceMotion} onChange={(reduceMotion) => saveAppearance({ reduceMotion })} />
    },
    {
      category: 'appearance',
      label: 'Interface font',
      hint: 'The font used for tabs, menus and Alchemy’s own pages.',
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
    {
      category: 'appearance',
      label: 'Bookmarks bar style',
      hint: 'Pills are rounded; Icons only fits more; Dock grows icons as you move across them.',
      keywords: 'bookmarks bar pills icons dock magnify style',
      control: (
        <Segmented
          value={a.bookmarkStyle ?? 'classic'}
          options={[
            { value: 'classic', label: 'Classic' },
            { value: 'pills', label: 'Pills' },
            { value: 'icons', label: 'Icons only' },
            { value: 'dock', label: 'Dock' }
          ]}
          onChange={(bookmarkStyle) => saveAppearance({ bookmarkStyle })}
        />
      )
    },

    // ---- new tab ----
    {
      category: 'newtab',
      label: 'Widgets',
      hint: 'Shown under your shortcuts on the new tab page. Click to turn each one on or off.',
      keywords: 'widgets weather quote todo to-do news focus timer pomodoro music now playing countdown stats recent',
      wide: true,
      control: (
        <div className="chips">
          {(
            [
              ['weather', 'Weather'],
              ['quote', 'Quote of the day'],
              ['todo', 'To do'],
              ['focus', 'Focus timer'],
              ['music', 'Now playing'],
              ['stats', 'Aegis stats'],
              ['countdown', 'Countdown'],
              ['recent', 'Pick up where you left off'],
              ['news', 'News']
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`chip toggle${s.widgets?.[id] ? ' on' : ''}`}
              aria-pressed={!!s.widgets?.[id]}
              onClick={() => set({ widgets: { ...s.widgets, [id]: !s.widgets?.[id] } })}
            >
              {s.widgets?.[id] && <Check size={12} strokeWidth={3} />}
              {label}
            </button>
          ))}
        </div>
      )
    },
    ...(s.widgets?.weather
      ? [
          {
            category: 'newtab' as const,
            label: 'Temperature',
            hint: s.weatherPlace ? `Weather for ${s.weatherPlace.name}. Change the city by clicking its name on the widget.` : 'Type your city on the weather widget.',
            control: (
              <Segmented
                value={s.tempUnit ?? 'C'}
                options={[
                  { value: 'C', label: '°C' },
                  { value: 'F', label: '°F' }
                ]}
                onChange={(tempUnit) => set({ tempUnit })}
              />
            )
          }
        ]
      : []),
    ...(s.widgets?.news
      ? [
          {
            category: 'newtab' as const,
            label: 'News feeds',
            hint: 'RSS or Atom feed addresses, one per line. Headlines are fetched straight from these sites.',
            keywords: 'rss atom feeds headlines',
            wide: true,
            control: <FeedsEditor feeds={s.newsFeeds ?? []} onSave={(newsFeeds) => set({ newsFeeds })} />
          }
        ]
      : []),
    {
      category: 'newtab',
      label: 'Show the clock',
      control: <Switch on={a.showClock} onChange={(showClock) => saveAppearance({ showClock })} />
    },
    ...(a.showClock
      ? [
          {
            category: 'newtab' as const,
            label: 'Clock style',
            keywords: 'time analog digital words seconds',
            control: (
              <Select
                value={a.clockStyle ?? 'classic'}
                width={200}
                onChange={(clockStyle) => saveAppearance({ clockStyle })}
                options={[
                  { value: 'classic' as const, label: 'Classic' },
                  { value: 'seconds' as const, label: 'With seconds' },
                  { value: 'bold' as const, label: 'Big and bold' },
                  { value: 'analog' as const, label: 'Analog' },
                  { value: 'words' as const, label: 'In words' }
                ]}
              />
            )
          }
        ]
      : []),
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

    // ---- Aegis blocker (ad blocking) ----
    {
      category: 'adblock',
      group: 'Blocker',
      label: 'Aegis blocker',
      hint: `Blocks ads and trackers. ${listsLine}`,
      keywords: 'aegis ad blocking adblock ads trackers ublock shield filter crypto miner mining',
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
      group: 'Blocker',
      label: 'Hide cookie banners',
      hint: 'Removes “accept cookies” popups using uBlock’s annoyance lists.',
      control: <Switch on={s.blockCookieBanners} onChange={(v) => set({ blockCookieBanners: v })} />
    },
    {
      category: 'adblock',
      group: 'Blocker',
      label: 'Shield count style',
      hint: 'How the shield in the address bar shows what was blocked on a page.',
      keywords: 'shield badge count ring pill number',
      control: (
        <Segmented
          value={a.countStyle ?? 'pill'}
          options={[
            { value: 'pill', label: 'Pill' },
            { value: 'badge', label: 'Badge' },
            { value: 'ring', label: 'Ring' },
            { value: 'none', label: 'Hidden' }
          ]}
          onChange={(countStyle) => saveAppearance({ countStyle })}
        />
      )
    },
    {
      category: 'adblock',
      group: 'Blocker',
      label: 'Count ads and trackers separately',
      hint: 'The shield, its panel and the Alchemy menu show ads and trackers as two numbers. Anything on EasyList counts as an ad; everything else blocked counts as a tracker.',
      keywords: 'split ads trackers count separate shield',
      control: <Switch on={s.splitBlockCounts} onChange={(v) => set({ splitBlockCounts: v })} />
    },
    {
      category: 'adblock',
      group: 'Blocker',
      label: 'Protection level',
      hint:
        s.aegisLevel === 'chill'
          ? 'Chill: blocks ads only. Sites behave most like they would without a blocker.'
          : s.aegisLevel === 'extreme'
            ? 'Extreme: blocks ads, trackers, cookie banners and other annoyances. A few sites may need Aegis turned off.'
            : 'Comfort: blocks ads and trackers. The best balance for most people.',
      keywords: 'level chill comfort extreme strict relaxed',
      control: (
        <Segmented
          value={s.aegisLevel ?? 'comfort'}
          options={[
            { value: 'chill', label: 'Chill' },
            { value: 'comfort', label: 'Comfort' },
            { value: 'extreme', label: 'Extreme' }
          ]}
          onChange={(aegisLevel) => set({ aegisLevel })}
        />
      )
    },
    ...(stats
      ? [
          {
            category: 'adblock' as const,
            group: 'Your stats',
            label: `${stats.blocked.toLocaleString()} blocked since ${new Date(stats.since).toLocaleDateString([], { month: 'long', day: 'numeric' })}`,
            hint:
              s.splitBlockCounts && stats.ads + stats.trackers > 0
                ? `${stats.ads.toLocaleString()} ads and ${stats.trackers.toLocaleString()} trackers since you turned on separate counts. Savings are estimates.`
                : 'Savings are estimates.',
            keywords: 'stats blocked saved time data battery',
            wide: true,
            control: <SavedTiles stats={stats} />
          },
          {
            category: 'adblock' as const,
            group: 'Your stats',
            label: 'The last 7 days',
            keywords: 'chart week day blocked',
            wide: true,
            control: <WeekChart stats={stats} />
          },
          {
            category: 'adblock' as const,
            group: 'Your stats',
            label: 'Who tried to track you',
            hint: 'Companies whose ads and trackers Aegis blocked the most.',
            keywords: 'companies trackers google meta amazon bubbles',
            wide: true,
            control: <CompanyBubbles stats={stats} />
          },
          {
            category: 'adblock' as const,
            group: 'Your stats',
            label: 'Most-blocked sites',
            hint: 'Your sites with the most ads and trackers.',
            keywords: 'sites most blocked',
            wide: true,
            control: <TopSites stats={stats} />
          }
        ]
      : []),
    ...(exceptions.length
      ? [
          {
            category: 'adblock' as const,
            group: 'Sites with Aegis off',
            label: 'Turned off from the shield in the address bar',
            hint: 'Click ✕ to turn Aegis back on for a site.',
            wide: true,
            control: (
              <div className="allow-cards">
                {exceptions.map((site) => (
                  <div key={site} className="allow-card">
                    <Favicon url={`https://${site}`} size={18} />
                    <span>{site}</span>
                    <button className="icon-btn" title="Turn Aegis back on here" onClick={() => api.invoke('shields:set', site, true)}>
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )
          }
        ]
      : []),

    // ---- privacy ----
    {
      category: 'privacy',
      group: 'Tracking',
      label: 'Block third-party cookies',
      hint: 'Stops companies following you across sites. A few embedded logins may need protections off for that site.',
      control: <Switch on={s.blockThirdPartyCookies} onChange={(v) => set({ blockThirdPartyCookies: v })} />
    },
    {
      category: 'privacy',
      group: 'Tracking',
      label: 'Fingerprinting protection',
      hint: 'Adds invisible noise to canvas, audio and graphics readouts so sites can’t identify your device.',
      control: <Switch on={s.fingerprintProtection} onChange={(v) => set({ fingerprintProtection: v })} />
    },
    {
      category: 'privacy',
      group: 'Tracking',
      label: 'Always use secure connections',
      hint: 'Upgrades sites to HTTPS, and falls back only if a site doesn’t support it.',
      keywords: 'https ssl',
      control: <Switch on={s.httpsUpgrade} onChange={(v) => set({ httpsUpgrade: v })} />
    },
    {
      category: 'privacy',
      group: 'Tracking',
      label: 'Send Global Privacy Control',
      hint: 'Tells sites not to sell or share your data.',
      keywords: 'gpc do not track dnt',
      control: <Switch on={s.sendGpc} onChange={(v) => set({ sendGpc: v })} />
    },
    {
      category: 'privacy',
      group: 'Hide your IP',
      label: 'Hide my IP in Masked Mode',
      hint: 'New Masked Mode windows go through Tor, so sites can’t see your real IP address. Slower, and some sites block Tor.',
      keywords: 'tor vpn ip hide proxy incognito private masked anonymous',
      control: <Switch on={s.maskedUsesTor} onChange={(v) => set({ maskedUsesTor: v })} />
    },
    {
      category: 'privacy',
      group: 'Hide your IP',
      label: 'Alchemy Tor',
      hint: 'A Masked Mode window that goes through the Tor network, so sites can’t see your real IP address. Slower than normal browsing.',
      keywords: 'tor onion vpn anonymous ip hide proxy',
      control: (
        <button className="btn small" onClick={() => api.invoke('window:newTor')}>
          Open Alchemy Tor
        </button>
      )
    },
    {
      category: 'privacy',
      group: 'Hide your IP',
      label: 'Always use Tor bridges',
      hint: 'Connect through Snowflake bridges, for networks that block Tor. Alchemy switches to them by itself when Tor can’t connect.',
      keywords: 'tor bridges snowflake censorship blocked',
      control: <Switch on={s.torBridges} onChange={(v) => set({ torBridges: v })} />
    },
    {
      category: 'privacy',
      group: 'Your data',
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
      group: 'Your data',
      label: 'Telemetry',
      hint: 'Alchemy never sends usage data anywhere.',
      control: <span className="good">None, ever</span>
    },

    // ---- performance ----
    {
      category: 'performance',
      label: 'Heavy Mode',
      hint: 'Give Alchemy more of your computer: tabs and panels never sleep or slow down in the background, and pages may use more memory. Uses more RAM and battery.',
      keywords: 'performance speed ram memory power gaming fast',
      control: <Switch on={perf.heavy} onChange={(heavy) => setPerf({ heavy })} />
    },
    ...(perf.heavy
      ? [
          {
            category: 'performance' as const,
            label: 'Memory per page',
            hint: 'How much JavaScript memory a single page may use. Applies after you restart Alchemy.',
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
      hint: 'When Alchemy uses more than this, the tabs you haven’t used for the longest go to sleep. Playing tabs never do.',
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
      hint: 'Caps how fast Alchemy downloads and uploads, so games, calls and other apps keep their share of your connection.',
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
          ? 'Restart Alchemy to apply this change.'
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
      label: 'Tab layout',
      hint: 'Vertical tabs run down the side with their full titles, handy with lots of tabs.',
      keywords: 'vertical tabs side layout horizontal',
      control: (
        <Segmented
          value={s.tabLayout ?? 'horizontal'}
          options={[
            { value: 'horizontal', label: 'Across the top' },
            { value: 'vertical', label: 'Vertical' }
          ]}
          onChange={(tabLayout) => set({ tabLayout })}
        />
      )
    },
    {
      category: 'tabs',
      label: 'Sidebar side',
      hint: 'Which side of the window the sidebar and sidebar sites go on.',
      keywords: 'sidebar right left side position',
      control: (
        <Segmented
          value={s.sidebarSide ?? 'left'}
          options={[
            { value: 'left', label: 'Left' },
            { value: 'right', label: 'Right' }
          ]}
          onChange={(sidebarSide) => set({ sidebarSide })}
        />
      )
    },
    {
      category: 'tabs',
      label: 'Sidebar',
      hint:
        s.sidebar === 'hidden'
          ? 'Hidden Sidebar: tucked away until you move the mouse to the edge of the window, then it slides out.'
          : s.sidebar === 'off'
            ? 'The sidebar with your workspaces and sidebar sites is turned off.'
            : 'Your workspaces and sidebar sites, down the left side.',
      keywords: 'sidebar rail hidden hide auto workspaces panels left edge',
      control: (
        <Segmented
          value={s.sidebar ?? 'shown'}
          options={[
            { value: 'shown', label: 'Shown' },
            { value: 'hidden', label: 'Hidden Sidebar' },
            { value: 'off', label: 'Off' }
          ]}
          onChange={(sidebar) => set({ sidebar })}
        />
      )
    },
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
      label: 'When Alchemy starts',
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
        ? 'Links you open in other apps open in Alchemy.'
        : 'Open links from other apps in Alchemy. Windows asks you to confirm in its Settings.',
      keywords: 'default browser links windows',
      control: isDefault ? (
        <span className="good">Alchemy is your default</span>
      ) : (
        <button className="btn small" onClick={() => api.invoke('defaultbrowser:open')}>
          Make default…
        </button>
      )
    },
    {
      category: 'startup',
      label: 'Ask to be the default browser',
      hint: 'Shows a reminder on the new tab page while Alchemy isn’t the default.',
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
        <p>Your {source.name} data stays where it is; Alchemy gets a copy.</p>
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
          <div className="about-name">Alchemy {info?.version}</div>
          <div className="set-hint">
            Chromium {info?.chrome} · Electron {info?.electron}
          </div>
          <div className="set-hint">Created by SkyNexusHD (SNHD) and FiveNova · GPL-3.0</div>
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
