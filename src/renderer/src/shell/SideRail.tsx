import { Plus } from '../lib/icons'
import { WorkspaceIcon } from '../lib/icons'
import { useEffect, useRef } from 'react'
import { baseColor, type PanelState, type Workspace } from '@shared/types'
import { inkOn, readableOn } from '../lib/color'
import { api } from '../lib/api'
import { useSettings } from '../lib/settings'
import { useShell } from './store'

/** Opens a floating editor/picker next to a rail button. */
function openBeside(el: HTMLElement, payload: object, width = 320): void {
  const r = el.getBoundingClientRect()
  api.invoke('overlay:show', { x: r.right + 2, y: Math.max(r.top - 16, 0), width, height: 420 }, payload, true)
}

export function SideRail(): React.JSX.Element {
  const isPrivate = useShell((s) => s.win.private)
  // Sidebar sites don't go through Tor, so Alchemy Tor windows leave them out.
  const isTor = useShell((s) => s.win.tor)
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

      {!isTor && (
        <>
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
        </>
      )}

    </nav>
  )
}

function WorkspaceButton({ ws, refMap }: { ws: Workspace; refMap: Map<string, HTMLButtonElement> }): React.JSX.Element {
  const active = useShell((s) => s.win.workspaceId === ws.id)
  const vars = useWorkspaceColors(ws)
  return (
    <button
      ref={(el) => {
        if (el) refMap.set(ws.id, el)
        else refMap.delete(ws.id)
      }}
      className={`ws-btn${active ? ' active' : ''}`}
      title={ws.name}
      style={vars}
      onClick={() => api.invoke('workspace:switch', ws.id)}
      onContextMenu={(e) => {
        e.preventDefault()
        api.invoke('workspace:menu', ws.id, e.clientX, e.clientY)
      }}
    >
      <span className="ws-face">{ws.icon ? <WorkspaceIcon id={ws.icon} size={16} /> : ws.name.charAt(0).toUpperCase()}</span>
    </button>
  )
}

/** CSS variables for a workspace's own accent (fill, text on it, and readable variant). */
export function useWorkspaceColors(ws: Workspace): React.CSSProperties {
  const fallback = useSettings((s) => s.settings?.appearance.accent ?? '#ec4856')
  const dark = useSettings((s) => s.dark)
  const mode = useSettings((s) => s.settings?.appearance.mode ?? 'ovyra')
  const accent = ws.accent ?? fallback
  return {
    '--wa': accent,
    '--wa-ink': inkOn(accent),
    '--wa-fg': readableOn(accent, baseColor(mode, dark))
  } as React.CSSProperties
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
