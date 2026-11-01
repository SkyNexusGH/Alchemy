import { Code, ExternalLink, RotateCw, X } from '../lib/icons'
import { useRef, useState } from 'react'
import { api } from '../lib/api'
import { useSettings } from '../lib/settings'
import { useReportRect } from './layout'
import { PanelIcon } from './SideRail'
import { useShell } from './store'

/** Drag handle shared by the docked panels; reports the final width once on release. */
function useResize(initial: number, onCommit: (w: number) => void, direction: 1 | -1) {
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const width = dragWidth ?? initial
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const startX = e.clientX
    const start = width
    const clamp = (x: number): number => Math.min(Math.max(start + (x - startX) * direction, 300), 1000)
    const move = (ev: PointerEvent): void => setDragWidth(clamp(ev.clientX))
    const up = (ev: PointerEvent): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      onCommit(clamp(ev.clientX))
      setDragWidth(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  return { width, onPointerDown }
}

/** DevTools for the active tab, docked on the right of the page. */
export function DevtoolsPane(): React.JSX.Element {
  const [saved, setSaved] = useState(() => Number(localStorage.getItem('devtoolsWidth')) || 480)
  const { width, onPointerDown } = useResize(
    saved,
    (w) => {
      setSaved(w)
      localStorage.setItem('devtoolsWidth', String(w))
    },
    -1
  )
  const page = useRef<HTMLDivElement>(null)
  useReportRect(page, 'layout:devtools')
  return (
    <aside className="devtools-pane" style={{ width }}>
      <div className="panel-head">
        <Code size={15} />
        <span className="panel-title">Developer tools</span>
        <button className="icon-btn small" title="Close (F12)" onClick={() => api.invoke('devtools:close')}>
          <X size={15} />
        </button>
      </div>
      <div className="panel-page" ref={page} />
      <div className="panel-resize" onPointerDown={onPointerDown} />
    </aside>
  )
}

/** The docked messenger panel: a header, the live page (a native view) and a resize edge. */
export function SidePanel(): React.JSX.Element | null {
  const panel = useShell((s) => s.win.panels.find((p) => p.id === s.win.panelId))
  const savedWidth = useSettings((s) => s.settings?.panelWidth ?? 480)
  const { width, onPointerDown } = useResize(savedWidth, (w) => void api.invoke('panel:width', w), 1)
  const page = useRef<HTMLDivElement>(null)
  useReportRect(page, 'layout:panel')
  if (!panel) return null

  return (
    <aside className="side-panel" style={{ width }}>
      <div className="panel-head">
        <PanelIcon panel={panel} size={16} />
        <span className="panel-title">{panel.title}</span>
        <button className="icon-btn small" title="Reload" onClick={() => api.invoke('panel:reload', panel.id)}>
          <RotateCw size={14} />
        </button>
        <button className="icon-btn small" title="Open in a tab" onClick={() => api.invoke('panel:openInTab', panel.id)}>
          <ExternalLink size={14} />
        </button>
        <button className="icon-btn small" title="Close panel" onClick={() => api.invoke('panel:hide')}>
          <X size={15} />
        </button>
      </div>
      <div className="panel-page" ref={page} />
      <div className="panel-resize" onPointerDown={onPointerDown} />
    </aside>
  )
}
