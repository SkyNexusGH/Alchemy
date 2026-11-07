import { Bookmark, Plus } from '../lib/icons'
import { WorkspaceIcon } from '../lib/icons'
import { useEffect, useRef, useState } from 'react'
import { baseColor, type PanelState, type Workspace } from '@shared/types'
import { inkOn, readableOn } from '../lib/color'
import { api } from '../lib/api'
import { saveSettings, useSettings } from '../lib/settings'
import { useShell } from './store'
import { useBookmarksPanel } from './BookmarksPanel'

/** Opens a floating editor/picker next to a rail button. */
function openBeside(el: HTMLElement, payload: object, width = 320): void {
  const r = el.getBoundingClientRect()
  // With the sidebar on the right, editors open to its left.
  const x = el.closest('.sidebar-right') ? r.left - width - 2 : r.right + 2
  api.invoke('overlay:show', { x, y: Math.max(r.top - 16, 0), width, height: 420 }, payload, true)
}

export function SideRail(props: { onMouseEnter?: () => void; onMouseLeave?: () => void }): React.JSX.Element {
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
    <nav className="rail" onMouseEnter={props.onMouseEnter} onMouseLeave={props.onMouseLeave}>
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

      <BookmarksButton />
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

      <div className="rail-spacer" />
      <RailClock />
    </nav>
  )
}

/** The time at the bottom of the sidebar, handy in full screen. */
function RailClock(): React.JSX.Element {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 10_000)
    return () => clearInterval(id)
  }, [])
  const [h, m] = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).split(':')
  return (
    <div className="rail-clock" title={now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}>
      <b>{h}</b>
      <span>{m?.slice(0, 2)}</span>
    </div>
  )
}

function BookmarksButton(): React.JSX.Element {
  const { open, toggle } = useBookmarksPanel()
  return (
    <button className={`rail-btn${open ? ' active' : ''}`} title="Bookmarks" onClick={toggle}>
      <Bookmark size={17} />
    </button>
  )
}

function WorkspaceButton({ ws, refMap }: { ws: Workspace; refMap: Map<string, HTMLButtonElement> }): React.JSX.Element {
  const active = useShell((s) => s.win.workspaceId === ws.id)
  const vars = useWorkspaceColors(ws)
  const { className: dropClass, ...reorder } = useReorder('workspaces', ws.id)
  return (
    <button
      {...reorder}
      ref={(el) => {
        if (el) refMap.set(ws.id, el)
        else refMap.delete(ws.id)
      }}
      className={`ws-btn${active ? ' active' : ''} ${dropClass}`}
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

/** Drag to reorder: which list is being dragged, and which item. */
let dragging: { list: 'panels' | 'workspaces'; id: string } | null = null

/** Props that make a sidebar button draggable within its own list. */
function useReorder(list: 'panels' | 'workspaces', id: string): React.HTMLAttributes<HTMLButtonElement> & { draggable: boolean } {
  const [over, setOver] = useState(false)
  return {
    draggable: true,
    className: over ? 'drop-before' : '',
    onDragStart: (e) => {
      dragging = { list, id }
      e.dataTransfer.effectAllowed = 'move'
    },
    onDragEnd: () => {
      dragging = null
      setOver(false)
    },
    onDragOver: (e) => {
      if (dragging?.list !== list || dragging.id === id) return
      e.preventDefault()
      setOver(true)
    },
    onDragLeave: () => setOver(false),
    onDrop: (e) => {
      e.preventDefault()
      setOver(false)
      const from = dragging
      dragging = null
      const s = useSettings.getState().settings
      if (!from || !s || from.list !== list) return
      // Put the dragged item just before the one it was dropped on.
      const items = [...(list === 'panels' ? s.panels : s.workspaces)] as { id: string }[]
      const moved = items.find((x) => x.id === from.id)
      if (!moved) return
      const rest = items.filter((x) => x.id !== from.id)
      rest.splice(rest.findIndex((x) => x.id === id), 0, moved)
      void saveSettings(list === 'panels' ? { panels: rest as typeof s.panels } : { workspaces: rest as typeof s.workspaces })
    }
  }
}

/** Hovering a closed sidebar site shows a peek of it (as it looked when last closed). */
const peek = (() => {
  let timer = 0
  let open = false
  return {
    enter(panel: PanelState, el: HTMLElement): void {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const r = el.getBoundingClientRect()
        const x = el.closest('.sidebar-right') ? r.left - 300 : r.right - 8
        open = true
        void api.invoke('panelcard:show', { x, y: r.top - 14, width: 300, height: 260 }, { kind: 'panelcard', id: panel.id, title: panel.title, url: panel.url })
      }, 650)
    },
    leave(): void {
      window.clearTimeout(timer)
      if (open) void api.invoke('bmcard:hide')
      open = false
    }
  }
})()

function PanelButton({ panel }: { panel: PanelState }): React.JSX.Element {
  const open = useShell((s) => s.win.panelId === panel.id)
  const { className: dropClass, ...reorder } = useReorder('panels', panel.id)
  return (
    <button
      {...reorder}
      className={`panel-btn${open ? ' active' : ''}${panel.loaded ? ' loaded' : ''} ${dropClass}`}
      title={panel.title}
      onPointerEnter={(e) => !open && peek.enter(panel, e.currentTarget)}
      onPointerLeave={peek.leave}
      onClick={() => {
        peek.leave()
        api.invoke('panel:toggle', panel.id)
      }}
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
