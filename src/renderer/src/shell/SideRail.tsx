import { Bookmark, Clock, Download, LayoutGrid, Plus, Settings } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { THEMES, type InternalPage, type PanelState, type Workspace } from '@shared/types'
import { api } from '../lib/api'
import { useSettings } from '../lib/settings'
import { useActiveTab, useShell } from './store'

const TOOLS: { page: InternalPage; label: string; icon: typeof Clock }[] = [
  { page: 'newtab', label: 'Speed dial', icon: LayoutGrid },
  { page: 'bookmarks', label: 'Bookmarks', icon: Bookmark },
  { page: 'history', label: 'History', icon: Clock },
  { page: 'downloads', label: 'Downloads', icon: Download }
]

/** Opens a floating editor/picker next to a rail button. */
function openBeside(el: HTMLElement, payload: object, width = 320): void {
  const r = el.getBoundingClientRect()
  api.invoke('overlay:show', { x: r.right + 2, y: Math.max(r.top - 16, 0), width, height: 420 }, payload, true)
}

export function SideRail(): React.JSX.Element {
  const tab = useActiveTab()
  const isPrivate = useShell((s) => s.win.private)
  const current = tab?.url.startsWith('ovyra://') ? new URL(tab.url).host : null
  const workspaces = useSettings((s) => s.settings?.workspaces ?? [])
  const panels = useShell((s) => s.win.panels)
  const wsRefs = useRef(new Map<string, HTMLButtonElement>())

  // "Edit workspace…" from the right-click menu opens the editor beside that workspace.
  useEffect(
    () =>
      api.on('edit-workspace', (id: string) => {
        const el = wsRefs.current.get(id)
        if (el) openBeside(el, { kind: 'workspace', workspaceId: id })
      }),
    []
  )

  return (
    <nav className="rail">
      {!isPrivate && (
        <>
          {workspaces.map((w) => (
            <WorkspaceButton key={w.id} ws={w} refMap={wsRefs.current} />
          ))}
          <button
            className="rail-add"
            title="New workspace"
            onClick={(e) => openBeside(e.currentTarget, { kind: 'workspace', workspaceId: null })}
          >
            <Plus size={14} />
          </button>
          <div className="rail-divider" />
        </>
      )}

      {panels.map((p) => (
        <PanelButton key={p.id} panel={p} />
      ))}
      <button
        className="rail-add"
        title="Add a messenger or site to the sidebar"
        onClick={(e) => openBeside(e.currentTarget, { kind: 'add-panel' }, 360)}
      >
        <Plus size={14} />
      </button>

      <div className="rail-spacer" />
      {TOOLS.map(({ page, label, icon: Icon }) => (
        <button
          key={page}
          className={`rail-btn small${current === page ? ' active' : ''}`}
          title={label}
          onClick={() => (page === 'newtab' ? api.invoke('tab:new') : api.invoke('internal:open', page))}
        >
          <Icon size={17} />
        </button>
      ))}
      <button
        className={`rail-btn small${current === 'settings' ? ' active' : ''}`}
        title="Settings"
        onClick={() => api.invoke('internal:open', 'settings')}
      >
        <Settings size={17} />
      </button>
    </nav>
  )
}

function WorkspaceButton({ ws, refMap }: { ws: Workspace; refMap: Map<string, HTMLButtonElement> }): React.JSX.Element {
  const active = useShell((s) => s.win.workspaceId === ws.id)
  const theme = THEMES.find((t) => t.id === ws.theme) ?? THEMES[0]
  return (
    <button
      ref={(el) => {
        if (el) refMap.set(ws.id, el)
        else refMap.delete(ws.id)
      }}
      className={`ws-btn${active ? ' active' : ''}`}
      title={ws.name}
      style={{ '--wa': theme.a, '--wb': theme.b } as React.CSSProperties}
      onClick={() => api.invoke('workspace:switch', ws.id)}
      onContextMenu={(e) => {
        e.preventDefault()
        api.invoke('workspace:menu', ws.id, e.clientX, e.clientY)
      }}
    >
      <span className="ws-face">{ws.icon || ws.name.charAt(0).toUpperCase()}</span>
    </button>
  )
}

function PanelButton({ panel }: { panel: PanelState }): React.JSX.Element {
  const open = useShell((s) => s.win.panelId === panel.id)
  return (
    <button
      className={`panel-btn${open ? ' active' : ''}${panel.loaded ? ' loaded' : ''}`}
      title={panel.title}
      onClick={() => api.invoke('panel:toggle', panel.id)}
      onContextMenu={(e) => {
        e.preventDefault()
        api.invoke('panel:menu', panel.id, e.clientX, e.clientY)
      }}
    >
      <PanelIcon panel={panel} size={22} />
      {panel.unread > 0 && <span className="unread">{panel.unread > 99 ? '99+' : panel.unread}</span>}
    </button>
  )
}

export function PanelIcon({ panel, size }: { panel: Pick<PanelState, 'favicon' | 'color' | 'title'>; size: number }): React.JSX.Element {
  if (panel.favicon) return <img src={panel.favicon} width={size} height={size} alt="" draggable={false} className="favicon" />
  return (
    <span className="letter-icon" style={{ width: size, height: size, fontSize: size * 0.55, background: panel.color }}>
      {panel.title.charAt(0).toUpperCase()}
    </span>
  )
}
