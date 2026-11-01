import { ExternalLink, RotateCw, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { api } from '../lib/api'
import { useSettings } from '../lib/settings'
import { useReportRect } from './layout'
import { PanelIcon } from './SideRail'
import { useShell } from './store'

/** The docked messenger panel: a header, the live page (a native view) and a resize edge. */
export function SidePanel(): React.JSX.Element | null {
  const panel = useShell((s) => s.win.panels.find((p) => p.id === s.win.panelId))
  const savedWidth = useSettings((s) => s.settings?.panelWidth ?? 480)
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const page = useRef<HTMLDivElement>(null)
  useReportRect(page, 'layout:panel')

  if (!panel) return null
  const width = dragWidth ?? savedWidth

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
      <div
        className="panel-resize"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          const startX = e.clientX
          const start = width
          const move = (ev: PointerEvent): void => setDragWidth(Math.min(Math.max(start + ev.clientX - startX, 300), 900))
          const up = (ev: PointerEvent): void => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', up)
            void api.invoke('panel:width', Math.min(Math.max(start + ev.clientX - startX, 300), 900)).then(() => setDragWidth(null))
          }
          window.addEventListener('pointermove', move)
          window.addEventListener('pointerup', up)
        }}
      />
    </aside>
  )
}
