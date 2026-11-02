import { ArrowLeft, ArrowRight, Columns2, Download,RefreshCw, RotateCw, X } from '../lib/icons'
import { useEffect, useRef, useState } from 'react'
import type { UpdateState } from '@shared/types'
import { api } from '../lib/api'
import { Omnibox } from './Omnibox'
import { useActiveTab, useShell } from './store'

export function Toolbar(): React.JSX.Element {
  const tab = useActiveTab()
  const isPrivate = useShell((s) => s.win.private)
  const split = useShell((s) => s.win.split)
  return (
    <div className="toolbar">
      <div className="nav-buttons">
        <button
          className="icon-btn"
          title="Back (Alt+Left)"
          disabled={!tab?.canGoBack}
          onClick={() => api.invoke('nav', 'back')}
        >
          <ArrowLeft size={17} />
        </button>
        <button
          className="icon-btn"
          title="Forward (Alt+Right)"
          disabled={!tab?.canGoForward}
          onClick={() => api.invoke('nav', 'forward')}
        >
          <ArrowRight size={17} />
        </button>
        <button
          className="icon-btn"
          title={tab?.loading ? 'Stop' : 'Reload (Ctrl+R)'}
          onClick={(e) => api.invoke('nav', tab?.loading ? 'stop' : e.shiftKey || e.ctrlKey ? 'hardReload' : 'reload')}
        >
          {tab?.loading ? <X size={17} /> : <RotateCw size={16} />}
        </button>
      </div>
      <Omnibox tab={tab} />
      <div className="toolbar-actions">
        {/* Chrome extension buttons; clicking one opens its popup. */}
        {!isPrivate && <browser-action-list alignment="bottom left" />}
        {split && (
          <button className="icon-btn split-on" title="Exit split view" onClick={() => api.invoke('split:exit')}>
            <Columns2 size={17} />
          </button>
        )}
        <UpdateButton />
        <DownloadsButton />
      </div>
      {tab?.loading && <div className="load-bar" />}
    </div>
  )
}

/** Appears once a new version has downloaded; one click restarts into it. */
function UpdateButton(): React.JSX.Element | null {
  const [update, setUpdate] = useState<UpdateState | null>(null)
  useEffect(() => {
    api.invoke<UpdateState>('update:state').then(setUpdate)
    return api.on('update', setUpdate)
  }, [])
  if (update?.status !== 'ready') return null
  return (
    <button
      className="update-pill"
      title={`Ovyra ${update.version} is ready. Restart to update; your tabs will come back.`}
      onClick={() => api.invoke('update:install')}
    >
      <RefreshCw size={13} strokeWidth={2.6} />
      Update
    </button>
  )
}

function DownloadsButton(): React.JSX.Element | null {
  const downloads = useShell((s) => s.downloads)
  const button = useRef<HTMLButtonElement>(null)
  const recent = downloads.filter((d) => Date.now() - d.started < 6 * 3600_000 || d.status === 'progressing')
  const active = downloads.filter((d) => d.status === 'progressing' || d.status === 'paused')
  const total = active.reduce((n, d) => n + d.total, 0)
  const received = active.reduce((n, d) => n + d.received, 0)
  const progress = active.length ? (total ? received / total : 0.15) : 1

  function open(): void {
    const r = button.current?.getBoundingClientRect()
    if (!r) return
    const width = 380
    api.invoke('overlay:show', { x: r.right - width + 14, y: r.bottom - 4, width, height: 120 }, { kind: 'downloads' }, true)
  }

  // Chrome-style: a new download pops the panel open.
  useEffect(() => api.on('download:started', () => setTimeout(open, 50)), [])

  if (!recent.length) return null
  const C = 2 * Math.PI * 12
  return (
    <button ref={button} className="icon-btn downloads-btn" title="Downloads" onClick={open}>
      <Download size={16} />
      {active.length > 0 && (
        <svg className="ring" viewBox="0 0 28 28">
          <circle cx="14" cy="14" r="12" className="ring-bg" />
          <circle cx="14" cy="14" r="12" className="ring-fg" strokeDasharray={`${C * progress} ${C}`} />
        </svg>
      )}
    </button>
  )
}
