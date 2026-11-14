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
  const allPanels = useShell((s) => s.win.panels)
  // Each workspace can show just its own sidebar sites.
  const workspaceId = useShell((s) => s.win.workspaceId)
  const shownHere = workspaces.find((w) => w.id === workspaceId)?.panels
  const panels = shownHere && !isPrivate ? allPanels.filter((p) => shownHere.includes(p.id)) : allPanels
  const wsRefs = useRef(new Map<string, HTMLButtonElement>())

  // The sidebar's one + button: what to add was picked in its menu.
  const addRef = useRef<HTMLButtonElement>(null)
  useEffect(
    () =>
      api.on('rail:add', (what: 'workspace' | 'panel') => {
        const el = addRef.current
        if (!el) return
        if (what === 'workspace') openBeside(el, { kind: 'workspace', workspaceId: null })
        else openBeside(el, { kind: 'add-panel' }, 360)
      }),
    []
  )
  // "Name, icon and color…" from a sidebar site's menu.
  useEffect(
    () =>
      api.on('panel:edit', (id: string) => {
        const el = document.querySelector<HTMLElement>(`[data-panel="${CSS.escape(id)}"]`)
        if (el) openBeside(el, { kind: 'add-panel', editId: id }, 320)
      }),
    []
  )
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
            ref={addRef}
            className="rail-add"
            title="Add a workspace, or a messenger or site to the sidebar"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              void api.invoke('rail:addMenu', r.right, r.top)
            }}
          >
            <Plus size={14} />
          </button>
        </>
      )}

      <div className="rail-spacer" />
    </nav>
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
  const mode = useSettings((s) => s.settings?.appearance.mode ?? 'alchemy')
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
      data-panel={panel.id}
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

export function PanelIcon({ panel, size }: { panel: Pick<PanelState, 'favicon' | 'color' | 'title' | 'badge'>; size: number }): React.JSX.Element {
  if (panel.badge)
    return (
      <span className="letter-icon" style={{ width: size, height: size, fontSize: size * (panel.badge.length > 1 ? 0.42 : 0.58), background: panel.color }}>
        {panel.badge}
      </span>
    )
  if (panel.favicon) return <img src={panel.favicon} width={size} height={size} alt="" draggable={false} className="favicon" />
  return (
    <span className="letter-icon" style={{ width: size, height: size, fontSize: size * 0.55, background: panel.color }}>
      {panel.title.charAt(0).toUpperCase()}
    </span>
  )
}
