import './overlay.css'
import {
  Bookmark,
  Check,
  ChevronRight,
  CircleX,
  Download,
  FileDown,
  Folder,
  Pause,
  Play,
  Search,
  ShieldCheck,
  ShieldOff,
  WorkspaceIcon
} from '../lib/icons'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  PANEL_PRESETS,
  type DownloadState,
  type MenuModel,
  type OverlayPayload,
  type PanelItem,
  type ShieldsInfo,
  type Suggestion
} from '@shared/types'
import { hostOf, toUrl } from '@shared/url'
import { api } from '../lib/api'
import { inkOn } from '../lib/color'
import { AccentPicker, WorkspaceIconPicker } from '../lib/pickers'
import { useSettings } from '../lib/settings'
import { AppMenu } from './AppMenu'
import { Palette } from './Palette'
import { Favicon, formatBytes } from '../lib/ui'

/**
 * Popups that must float above web pages (the omnibox dropdown, the downloads panel)
 * live in this transparent view stacked on top of the page.
 */
export default function Overlay(): React.JSX.Element {
  const [payload, setPayload] = useState<OverlayPayload | null>(null)
  useEffect(() => api.on('overlay:data', setPayload), [])

  return (
    <div
      className={`overlay-root${payload?.kind === 'menu' ? ' full' : ''}`}
      onMouseDown={(e) => e.target === e.currentTarget && api.invoke('overlay:hide')}
    >
      {payload?.kind === 'omnibox' && <Suggestions items={payload.items} selected={payload.selected} />}
      {payload?.kind === 'downloads' && <DownloadsPanel />}
      {payload?.kind === 'shields' && <ShieldsPanel key={payload.tabId} tabId={payload.tabId} />}
      {payload?.kind === 'workspace' && <WorkspaceEditor key={payload.workspaceId ?? 'new'} id={payload.workspaceId} />}
      {payload?.kind === 'add-panel' && <AddPanel />}
      {payload?.kind === 'palette' && <PaletteHost />}
      {payload?.kind === 'app' && <AppMenu />}
      {payload?.kind === 'menu' && <MenuHost key={`${payload.x},${payload.y}`} items={payload.items} x={payload.x} y={payload.y} />}
    </div>
  )
}

function PaletteHost(): React.JSX.Element {
  useDismiss()
  return <Palette onFit={(h) => void api.invoke('overlay:resize', h + 28)} />
}

// ---- menus -------------------------------------------------------------------------

/** Ovyra's own menus: right-click, app menu, tab menu. Keyboard: arrows, Enter, Esc. */
function MenuHost({ items, x, y }: { items: MenuModel[]; x: number; y: number }): React.JSX.Element {
  useDismiss()
  const choose = (item: MenuModel): void => {
    if (item.enabled && item.type !== 'separator' && !item.submenu) void api.invoke('menu:choose', item.id)
  }
  return <MenuList items={items} x={x} y={y} onChoose={choose} root />
}

function MenuList({
  items,
  x,
  y,
  onChoose,
  root,
  side = 'right'
}: {
  items: MenuModel[]
  x: number
  y: number
  onChoose: (item: MenuModel) => void
  root?: boolean
  side?: 'right' | 'left'
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y, flip: false })
  const [active, setActive] = useState(-1)
  const [open, setOpen] = useState<number | null>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])

  // Keep the menu on screen: flip left/up when it would overflow the window.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    let left = side === 'left' ? x - w : x
    let flip = side === 'left'
    if (left + w > innerWidth - 6) {
      left = root ? innerWidth - w - 6 : x - w
      flip = true
    }
    const top = Math.max(6, Math.min(y, innerHeight - h - 6))
    setPos({ left: Math.max(6, left), top, flip })
  }, [x, y, side, root])

  const focusable = items.map((it, i) => (it.type !== 'separator' && it.enabled ? i : -1)).filter((i) => i >= 0)

  useEffect(() => {
    if (!root) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const idx = focusable.indexOf(active)
        const n = focusable.length
        setActive(e.key === 'ArrowDown' ? focusable[(idx + 1) % n] : focusable[(idx - 1 + n) % n])
      } else if (e.key === 'ArrowRight' && items[active]?.submenu) {
        setOpen(active)
      } else if (e.key === 'Enter' && items[active]) {
        if (items[active].submenu) setOpen(active)
        else onChoose(items[active])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="menu" ref={ref} style={{ left: pos.left, top: pos.top }}>
      {items.map((item, i) =>
        item.type === 'separator' ? (
          <div key={`sep${i}`} className="menu-sep" />
        ) : (
          <div
            key={item.id}
            ref={(el) => {
              itemRefs.current[i] = el
            }}
            className={`menu-item${item.enabled ? '' : ' disabled'}${active === i ? ' active' : ''}`}
            onMouseEnter={() => {
              setActive(i)
              setOpen(item.submenu && item.enabled ? i : null)
            }}
            onMouseUp={() => onChoose(item)}
          >
            <span className="menu-check">
              {(item.type === 'checkbox' || item.type === 'radio') && item.checked && <Check size={14} strokeWidth={2.4} />}
            </span>
            <span className="menu-label">{item.label}</span>
            {item.hint && <span className="menu-hint">{item.hint.replace('CmdOrCtrl', 'Ctrl')}</span>}
            {item.submenu && <ChevronRight size={14} className="menu-arrow" />}
            {open === i && item.submenu && <SubMenu anchor={itemRefs.current[i]} items={item.submenu} onChoose={onChoose} flip={pos.flip} />}
          </div>
        )
      )}
    </div>
  )
}

function SubMenu({
  anchor,
  items,
  onChoose,
  flip
}: {
  anchor: HTMLDivElement | null
  items: MenuModel[]
  onChoose: (item: MenuModel) => void
  flip: boolean
}): React.JSX.Element | null {
  if (!anchor) return null
  const r = anchor.getBoundingClientRect()
  return <MenuList items={items} x={flip ? r.left + 4 : r.right - 4} y={r.top - 5} onChoose={onChoose} side={flip ? 'left' : 'right'} />
}

// ---- workspace editor --------------------------------------------------------------

function WorkspaceEditor({ id }: { id: string | null }): React.JSX.Element {
  const settings = useSettings((s) => s.settings)
  const existing = settings?.workspaces.find((w) => w.id === id)
  const [name, setName] = useState(existing?.name ?? '')
  const [icon, setIcon] = useState(existing?.icon ?? 'work')
  const [accent, setAccent] = useState<string | null>(existing ? existing.accent : null)
  const panel = useRef<HTMLFormElement>(null)
  useDismiss()
  useFitHeight(panel)

  const save = async (): Promise<void> => {
    await api.invoke('workspace:save', { id: id ?? '', name: name || 'Workspace', icon, accent })
    api.invoke('overlay:hide')
  }
  const shown = accent ?? settings?.appearance.accent ?? '#ec4856'

  return (
    <form
      className="panel ws-editor"
      ref={panel}
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <div className="wse-top">
        <div className="wse-preview" style={{ background: shown, color: inkOn(shown) }}>
          {icon ? <WorkspaceIcon id={icon} size={22} /> : <span>{(name || 'W').charAt(0).toUpperCase()}</span>}
        </div>
        <div className="wse-title">{existing ? 'Edit workspace' : 'New workspace'}</div>
      </div>
      <input className="field" autoFocus placeholder="Name, e.g. Work" value={name} maxLength={32} onChange={(e) => setName(e.target.value)} />
      <div className="wse-label">Icon</div>
      <WorkspaceIconPicker value={icon} name={name} onChange={setIcon} />
      <div className="wse-label">Color</div>
      <AccentPicker value={accent} onChange={setAccent} allowDefault size={22} />
      <div className="wse-buttons">
        <button type="button" className="btn small" onClick={() => api.invoke('overlay:hide')}>
          Cancel
        </button>
        <button type="submit" className="btn small primary">
          {existing ? 'Save' : 'Create'}
        </button>
      </div>
    </form>
  )
}

function AddPanel(): React.JSX.Element {
  const panels = useShellPanels()
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const panel = useRef<HTMLDivElement>(null)
  useDismiss()
  useFitHeight(panel)
  const added = new Set(panels.map((p) => p.url))
  const available = PANEL_PRESETS.filter((p) => !added.has(p.url))
  const resolved = toUrl(url)

  const add = (item: PanelItem): void => {
    void api.invoke('panels:add', item)
    api.invoke('overlay:hide')
  }

  return (
    <div className="panel add-panel" ref={panel}>
      <div className="wse-title">Add to sidebar</div>
      <p className="ap-hint">Opens in a side panel and stays logged in. Unread counts show on the icon.</p>
      {available.length > 0 && (
        <div className="ap-grid">
          {available.map((p) => (
            <button key={p.id} className="ap-item" onClick={() => add(p)}>
              <span className="letter-icon" style={{ width: 34, height: 34, fontSize: 16, background: p.color }}>
                {p.title.charAt(0)}
              </span>
              <span>{p.title}</span>
            </button>
          ))}
        </div>
      )}
      <form
        className="ap-custom"
        onSubmit={(e) => {
          e.preventDefault()
          if (resolved) add({ id: '', title: title.trim() || hostOf(resolved), url: resolved, color: '#8b5cf6' })
        }}
      >
        <div className="wse-label">Any website</div>
        <input className="field" placeholder="Address, e.g. slack.com" value={url} onChange={(e) => setUrl(e.target.value)} />
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="field" style={{ flex: 1, minWidth: 0 }} placeholder="Name (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <button type="submit" className="btn small primary" disabled={!resolved} style={{ height: 36 }}>
            Add
          </button>
        </div>
      </form>
    </div>
  )
}

/** The overlay has no window state of its own; panels come from settings. */
function useShellPanels(): PanelItem[] {
  return useSettings((s) => s.settings?.panels ?? [])
}

/** Panels that close when you click away or press Escape. */
function useDismiss(): void {
  useEffect(() => {
    const hide = (): void => void api.invoke('overlay:hide')
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') hide()
    }
    window.addEventListener('blur', hide)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('blur', hide)
      window.removeEventListener('keydown', onKey)
    }
  }, [])
}

/** Sizes the native overlay view to fit the panel. */
function useFitHeight(panel: React.RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    if (panel.current) api.invoke('overlay:resize', panel.current.offsetHeight + 28)
  })
}

function ShieldsPanel({ tabId }: { tabId: number }): React.JSX.Element {
  const [info, setInfo] = useState<ShieldsInfo | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  useDismiss()
  useFitHeight(panel)

  useEffect(() => {
    const load = (): void => void api.invoke<ShieldsInfo | null>('shields:info', tabId).then(setInfo)
    load()
    // Pages keep loading ads after the panel opens; keep the numbers live.
    const id = setInterval(load, 1000)
    return () => clearInterval(id)
  }, [tabId])

  if (!info) return <div className="panel shields-panel" ref={panel} />
  const on = info.enabled
  const saved = Math.round((info.totalBlocked * 0.05) / 60)

  return (
    <div className="panel shields-panel" ref={panel}>
      <div className={`sh-hero${on ? ' on' : ''}`}>
        <div className="sh-site">
          <span className="sh-icon">{on ? <ShieldCheck size={20} /> : <ShieldOff size={20} />}</span>
          <div style={{ minWidth: 0 }}>
            <div className="sh-name">{info.site}</div>
            <div className="sh-state">
              {info.globallyOff ? 'Ad blocking is off in settings' : on ? 'Protections are on' : 'Protections are off for this site'}
            </div>
          </div>
          {!info.globallyOff && (
            <button
              role="switch"
              aria-checked={on}
              className="switch"
              title={on ? 'Turn off for this site (the page will reload)' : 'Turn protections back on'}
              onClick={async () => {
                await api.invoke('shields:set', info.site, !on)
                setInfo({ ...info, enabled: !on, blocked: 0, hosts: [] })
              }}
            />
          )}
        </div>
        {on && (
          <div className="sh-count">
            <span className="sh-num">{info.blocked}</span>
            <span>ads & trackers blocked on this page</span>
          </div>
        )}
      </div>

      {on && info.hosts.length > 0 && (
        <div className="sh-list">
          {info.hosts.map(([host, n]) => (
            <div key={host} className="sh-row">
              <span className="sh-host">{host}</span>
              <span className="sh-n">{n}</span>
            </div>
          ))}
        </div>
      )}
      {!on && !info.globallyOff && (
        <p className="sh-note">Turn protections off only if this site isn't working right. Ads, trackers, third-party cookies and fingerprinting are then allowed here.</p>
      )}

      <div className="sh-foot">
        <span>
          <b>{info.totalBlocked.toLocaleString()}</b> blocked in total{saved > 0 ? ` · ~${saved} min saved` : ''}
        </span>
        <button
          className="btn small"
          onClick={() => {
            api.invoke('internal:open', 'settings')
            api.invoke('overlay:hide')
          }}
        >
          Settings
        </button>
      </div>
    </div>
  )
}

function Suggestions({ items, selected }: { items: Suggestion[]; selected: number }): React.JSX.Element {
  return (
    <div className="panel suggestions">
      {items.map((s, i) => (
        <div
          key={`${s.kind}:${s.value}`}
          className={`sugg${i === selected ? ' selected' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault()
            api.invoke('overlay:pick', i, { newTab: e.button === 1 || e.ctrlKey })
          }}
        >
          <span className="sugg-icon">
            {s.kind === 'search' || s.kind === 'suggest' ? (
              <Search size={15} />
            ) : (
              <Favicon src={s.favicon} url={/^https?:/.test(s.value) ? s.value : `https://${s.value}`} size={16} />
            )}
            {s.kind === 'bookmark' && (
              <span className="sugg-badge">
                <Bookmark size={8} strokeWidth={3} />
              </span>
            )}
          </span>
          <span className="sugg-title">{s.title}</span>
          {s.detail && <span className="sugg-detail">{s.detail}</span>}
        </div>
      ))}
    </div>
  )
}

function DownloadsPanel(): React.JSX.Element {
  const [list, setList] = useState<DownloadState[]>([])
  const panel = useRef<HTMLDivElement>(null)

  useDismiss()
  useFitHeight(panel)
  useEffect(() => {
    api.invoke<DownloadState[]>('downloads:list').then(setList)
    return api.on('downloads', setList)
  }, [])

  const recent = list.slice(0, 5)
  return (
    <div className="panel downloads-panel" ref={panel}>
      <div className="dl-head">
        <span>Recent downloads</span>
        <button
          className="btn small"
          onClick={() => {
            api.invoke('internal:open', 'downloads')
            api.invoke('overlay:hide')
          }}
        >
          Show all
        </button>
      </div>
      {recent.length === 0 && <div className="dl-empty">Nothing downloaded yet.</div>}
      {recent.map((d) => (
        <DownloadRow key={d.id} d={d} />
      ))}
    </div>
  )
}

function DownloadRow({ d }: { d: DownloadState }): React.JSX.Element {
  const act = (action: string) => (e: React.MouseEvent) => {
    e.stopPropagation()
    api.invoke('downloads:action', d.id, action)
  }
  const pct = d.total ? Math.min(100, (d.received / d.total) * 100) : 0
  const running = d.status === 'progressing' || d.status === 'paused'
  const status =
    d.status === 'progressing'
      ? `${formatBytes(d.received)}${d.total ? ` of ${formatBytes(d.total)}` : ''} · ${formatBytes(d.speed)}/s`
      : d.status === 'paused'
        ? `Paused · ${formatBytes(d.received)} of ${formatBytes(d.total)}`
        : d.status === 'completed'
          ? formatBytes(d.total)
          : d.status === 'cancelled'
            ? 'Cancelled'
            : 'Failed'

  return (
    <div className={`dl-row ${d.status}`} onClick={d.status === 'completed' ? act('open') : undefined}>
      <span className="dl-icon">{d.status === 'completed' ? <FileDown size={18} /> : <Download size={18} />}</span>
      <div className="dl-info">
        <div className="dl-name">{d.filename}</div>
        <div className="dl-status">{status}</div>
        {running && (
          <div className="dl-progress">
            <div style={{ width: `${d.total ? pct : 30}%` }} className={d.total ? '' : 'indeterminate'} />
          </div>
        )}
      </div>
      <div className="dl-actions">
        {d.status === 'progressing' && (
          <button className="icon-btn" title="Pause" onClick={act('pause')}>
            <Pause size={15} />
          </button>
        )}
        {d.status === 'paused' && (
          <button className="icon-btn" title="Resume" onClick={act('resume')}>
            <Play size={15} />
          </button>
        )}
        {running && (
          <button className="icon-btn" title="Cancel" onClick={act('cancel')}>
            <CircleX size={15} />
          </button>
        )}
        {d.status === 'completed' && (
          <button className="icon-btn" title="Show in folder" onClick={act('show')}>
            <Folder size={15} />
          </button>
        )}
      </div>
    </div>
  )
}
