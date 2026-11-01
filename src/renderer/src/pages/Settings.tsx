import './pages.css'
import { Settings as SettingsIcon, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { SEARCH_ENGINES, THEMES, type FilterStatus, type SearchEngineId, type Settings as S, type UpdateState } from '@shared/types'
import { api } from '../lib/api'
import { saveSettings, useSettings, useWorkspace } from '../lib/settings'
import { Logo, setPageIcon } from '../lib/ui'
import { ClearDataDialog } from './ClearDataDialog'

document.title = 'Settings'
setPageIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>')

interface Info {
  version: string
  chrome: string
  electron: string
  downloads: string
}

export default function Settings(): React.JSX.Element {
  const s = useSettings((st) => st.settings)
  const workspace = useWorkspace()
  const [info, setInfo] = useState<Info | null>(null)
  const [clearing, setClearing] = useState(false)
  useEffect(() => void api.invoke<Info>('app:info').then(setInfo), [])
  if (!s) return <div className="page" />

  const set = (patch: Partial<S>): void => void saveSettings(patch)

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <div className="page-head">
        <span className="page-icon">
          <SettingsIcon size={22} />
        </span>
        <h1>Settings</h1>
      </div>

      <Section title="Appearance">
        <Row
          label={`Colors for “${workspace?.name ?? 'Home'}”`}
          hint="Each workspace has its own colors. Right-click a workspace in the sidebar to rename it."
        >
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {THEMES.map((t) => (
              <button
                key={t.id}
                title={t.name}
                onClick={() => workspace && api.invoke('workspace:save', { ...workspace, theme: t.id })}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  background: `linear-gradient(135deg, ${t.a}, ${t.b})`,
                  boxShadow:
                    workspace?.theme === t.id
                      ? `0 0 0 2px var(--bg), 0 0 0 4px ${t.a}, 0 6px 18px -4px ${t.a}`
                      : 'inset 0 0 0 1px rgba(255,255,255,.2)',
                  transform: workspace?.theme === t.id ? 'scale(1.08)' : undefined,
                  transition: 'transform 200ms var(--spring), box-shadow 200ms'
                }}
              />
            ))}
          </div>
        </Row>
        <Row label="Show bookmarks bar" hint="Ctrl+Shift+B">
          <Switch on={s.showBookmarksBar} onChange={(v) => set({ showBookmarksBar: v })} />
        </Row>
      </Section>

      <ImportSection />

      <Section title="Sidebar & tabs">
        <Row label="Tab islands" hint="Tabs you open from a page are grouped with it. Click an island's dot to fold it away.">
          <Switch on={s.tabIslands} onChange={(v) => set({ tabIslands: v })} />
        </Row>
        <Row label="Video popout" hint="Shows a “Pop out” button on videos that floats them above your other windows.">
          <Switch on={s.videoPopout} onChange={(v) => set({ videoPopout: v })} />
        </Row>
        <Row
          label="Unload closed sidebar panels"
          hint="Frees memory when you haven't opened a messenger for a while. Keep them running to get notifications all the time."
        >
          <select className="field" value={s.panelSleepMinutes} onChange={(e) => set({ panelSleepMinutes: Number(e.target.value) })}>
            <option value={0}>Never (always get notifications)</option>
            <option value={10}>After 10 minutes</option>
            <option value={30}>After 30 minutes</option>
            <option value={120}>After 2 hours</option>
          </select>
        </Row>
      </Section>

      <Section title="Search">
        <Row label="Search engine" hint="Used by the address bar and the new tab page.">
          <select
            className="field"
            value={s.searchEngine}
            onChange={(e) => set({ searchEngine: e.target.value as SearchEngineId })}
          >
            {Object.entries(SEARCH_ENGINES).map(([id, e]) => (
              <option key={id} value={id}>
                {e.name}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Search suggestions" hint="Send what you type to your search engine for suggestions (without cookies).">
          <Switch on={s.searchSuggestions} onChange={(v) => set({ searchSuggestions: v })} />
        </Row>
      </Section>

      <Section title="Startup">
        <Row label="When Ovyra starts">
          <select className="field" value={s.startup} onChange={(e) => set({ startup: e.target.value as S['startup'] })}>
            <option value="restore">Continue where you left off</option>
            <option value="newtab">Open a new tab</option>
          </select>
        </Row>
      </Section>

      <Section title="Performance">
        <Row
          label="Sleeping tabs"
          hint="Background tabs you haven't looked at in a while are unloaded to free memory. They reload, with their history intact, when you click them. Pinned tabs and tabs playing audio never sleep."
        >
          <select
            className="field"
            value={s.sleepAfterMinutes}
            onChange={(e) => set({ sleepAfterMinutes: Number(e.target.value) })}
          >
            <option value={0}>Never</option>
            <option value={5}>After 5 minutes</option>
            <option value={15}>After 15 minutes</option>
            <option value={30}>After 30 minutes</option>
            <option value={60}>After 1 hour</option>
            <option value={180}>After 3 hours</option>
          </select>
        </Row>
      </Section>

      <Section title="Downloads">
        <Row label="Location" hint={s.downloadDir ?? info?.downloads ?? ''}>
          <div style={{ display: 'flex', gap: 8 }}>
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
        </Row>
        <Row label="Ask where to save each file">
          <Switch on={s.askWhereToSave} onChange={(v) => set({ askWhereToSave: v })} />
        </Row>
      </Section>

      <PrivacySettings s={s} set={set} onClear={() => setClearing(true)} />

      <Section title="About">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '6px 4px' }}>
          <Logo size={40} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Ovyra {info?.version}</div>
            <div style={{ color: 'var(--text-3)', fontSize: 12, marginTop: 2 }}>
              Chromium {info?.chrome} · Electron {info?.electron}
            </div>
          </div>
          <span style={{ flex: 1 }} />
          <UpdateStatus />
        </div>
      </Section>

      {clearing && <ClearDataDialog onClose={() => setClearing(false)} />}
    </div>
  )
}

function PrivacySettings({
  s,
  set,
  onClear
}: {
  s: S
  set: (patch: Partial<S>) => void
  onClear: () => void
}): React.JSX.Element {
  const [filters, setFilters] = useState<FilterStatus | null>(null)
  const [exceptions, setExceptions] = useState<string[]>([])
  const [stats, setStats] = useState<{ blocked: number; since: number } | null>(null)

  useEffect(() => {
    api.invoke<FilterStatus>('filters:status').then(setFilters)
    api.invoke<string[]>('shields:exceptions').then(setExceptions)
    api.invoke<{ blocked: number; since: number }>('shields:stats').then(setStats)
    const off1 = api.on('filters', setFilters)
    const off2 = api.on('shields:exceptions', setExceptions)
    return () => {
      off1()
      off2()
    }
  }, [])

  const listsLine = !filters
    ? ''
    : filters.updating
      ? 'Updating filter lists…'
      : filters.error && !filters.ready
        ? `Couldn't download filter lists: ${filters.error}`
        : `${filters.lists} uBlock Origin–compatible lists${filters.updated ? ` · updated ${ago(filters.updated)}` : ''}`

  return (
    <>
      <Section title="Ads & trackers">
        {stats && stats.blocked > 0 && (
          <div className="blocked-hero">
            <span className="blocked-num">{stats.blocked.toLocaleString()}</span>
            <span>
              ads and trackers blocked since {new Date(stats.since).toLocaleDateString([], { month: 'long', day: 'numeric' })}
              <br />
              <span style={{ color: 'var(--text-3)' }}>about {Math.max(1, Math.round((stats.blocked * 0.05) / 60))} min of loading saved</span>
            </span>
          </div>
        )}
        <Row label="Block ads and trackers" hint={listsLine}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {s.adblock && (
              <button className="btn small" disabled={filters?.updating} onClick={() => api.invoke('filters:update')}>
                {filters?.updating ? 'Updating…' : 'Update now'}
              </button>
            )}
            <Switch on={s.adblock} onChange={(v) => set({ adblock: v })} />
          </div>
        </Row>
        <Row label="Hide cookie banners" hint="Removes “accept cookies” popups using uBlock's annoyance lists.">
          <Switch on={s.blockCookieBanners} onChange={(v) => set({ blockCookieBanners: v })} />
        </Row>
        {exceptions.length > 0 && (
          <Row label="Sites with protections off" hint="Turned off from the shield in the address bar.">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end', maxWidth: 320 }}>
              {exceptions.map((site) => (
                <button
                  key={site}
                  className="btn small"
                  title="Turn protections back on"
                  onClick={() => api.invoke('shields:set', site, true)}
                >
                  {site} <X size={12} />
                </button>
              ))}
            </div>
          </Row>
        )}
      </Section>

      <Section title="Privacy">
        <Row label="Block third-party cookies" hint="Stops companies from following you across sites with cookies. A few embedded logins may need protections turned off for that site.">
          <Switch on={s.blockThirdPartyCookies} onChange={(v) => set({ blockThirdPartyCookies: v })} />
        </Row>
        <Row label="Fingerprinting protection" hint="Adds invisible noise to canvas, audio and graphics readouts so sites can't identify your device.">
          <Switch on={s.fingerprintProtection} onChange={(v) => set({ fingerprintProtection: v })} />
        </Row>
        <Row label="Always use secure connections" hint="Upgrades sites to HTTPS, and falls back only if a site doesn't support it.">
          <Switch on={s.httpsUpgrade} onChange={(v) => set({ httpsUpgrade: v })} />
        </Row>
        <Row label="Send Global Privacy Control" hint="Tells sites not to sell or share your data (legally binding in some regions).">
          <Switch on={s.sendGpc} onChange={(v) => set({ sendGpc: v })} />
        </Row>
        <Row label="Clear browsing data" hint="History, cookies, cache, permissions.">
          <button className="btn small" onClick={onClear}>
            Clear…
          </button>
        </Row>
        <Row label="Telemetry" hint="Ovyra never sends usage data anywhere.">
          <span style={{ color: 'var(--ok)', fontWeight: 600 }}>None, ever</span>
        </Row>
      </Section>
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
    disabled: 'Updates are off in development builds',
    idle: '',
    checking: 'Checking for updates…',
    downloading: `Downloading ${u.version ?? 'update'}… ${u.percent ?? 0}%`,
    ready: `Version ${u.version} is ready`,
    latest: 'Ovyra is up to date',
    error: "Couldn't check for updates"
  }[u.status]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span className="setting-hint" style={{ marginTop: 0, color: u.status === 'ready' ? 'var(--ok)' : undefined }} title={u.error}>
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

interface ImportSource {
  id: string
  name: string
  hasBookmarks: boolean
  hasHistory: boolean
  hasSpeedDial: boolean
}

function ImportSection(): React.JSX.Element | null {
  const [sources, setSources] = useState<ImportSource[]>([])
  const [picked, setPicked] = useState<ImportSource | null>(null)
  const [done, setDone] = useState<Record<string, string>>({})
  useEffect(() => void api.invoke<ImportSource[]>('import:sources').then(setSources), [])
  if (!sources.length) return null

  return (
    <Section title="Import">
      <Row label="Bring your stuff over" hint="Copies bookmarks, history and Opera's speed dial from browsers on this PC. Nothing is uploaded.">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {sources.map((src) => (
            <button key={src.id} className="btn small" onClick={() => setPicked(src)}>
              {done[src.id] ? `✓ ${src.name}` : `From ${src.name}`}
            </button>
          ))}
        </div>
      </Row>
      {Object.entries(done).map(([id, msg]) => (
        <div key={id} className="setting-hint" style={{ padding: '0 0 12px', color: 'var(--ok)' }}>
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
    </Section>
  )
}

function ImportDialog({ source, onClose }: { source: ImportSource; onClose: (msg?: string) => void }): React.JSX.Element {
  const [what, setWhat] = useState({ bookmarks: source.hasBookmarks, history: source.hasHistory, speedDial: source.hasSpeedDial })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const options = [
    { key: 'bookmarks', label: 'Bookmarks', show: source.hasBookmarks },
    { key: 'speedDial', label: 'Speed dial', show: source.hasSpeedDial },
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
              <input type="checkbox" checked={what[o.key]} onChange={(e) => setWhat({ ...what, [o.key]: e.target.checked })} />
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
                  `Imported from ${source.name}: ${r.bookmarks} bookmarks, ${r.speedDial} speed dial sites, ${r.history.toLocaleString()} history pages.`
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

function ago(time: number): string {
  const min = Math.round((Date.now() - time) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} days ago`
}

function Section({ title, children }: { title: string; children: ReactNode }): React.JSX.Element {
  return (
    <section>
      <div className="group-title">{title}</div>
      <div className="card" style={{ padding: '6px 18px' }}>
        {children}
      </div>
    </section>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }): React.JSX.Element {
  return (
    <div className="setting-row">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 550 }}>{label}</div>
        {hint && <div className="setting-hint">{hint}</div>}
      </div>
      {children}
    </div>
  )
}

function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }): React.JSX.Element {
  return <button role="switch" aria-checked={on} className="switch" onClick={() => onChange(!on)} />
}
