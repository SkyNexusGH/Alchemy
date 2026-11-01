import './pages.css'
import { CircleX, Download, ExternalLink, FileDown, Folder, Pause, Play, RefreshCw, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { DownloadState } from '@shared/types'
import { hostOf } from '@shared/url'
import { api } from '../lib/api'
import { formatBytes, setPageIcon } from '../lib/ui'

document.title = 'Downloads'
setPageIcon('<path d="M12 3v12m0 0-5-5m5 5 5-5M4 20h16"/>')

export default function Downloads(): React.JSX.Element {
  const [list, setList] = useState<DownloadState[]>([])
  useEffect(() => {
    api.invoke<DownloadState[]>('downloads:list').then(setList)
    return api.on('downloads', setList)
  }, [])

  const act = (id: string, action: string) => () => void api.invoke('downloads:action', id, action)

  return (
    <div className="page">
      <div className="page-head">
        <span className="page-icon">
          <Download size={22} />
        </span>
        <h1>Downloads</h1>
        <span className="spacer" />
        {list.length > 0 && (
          <button className="btn" onClick={() => api.invoke('downloads:clear')}>
            Clear list
          </button>
        )}
      </div>

      {list.length === 0 && (
        <div className="empty">
          <Download size={40} />
          <div>Files you download will show up here.</div>
        </div>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {list.map((d) => {
          const running = d.status === 'progressing' || d.status === 'paused'
          const pct = d.total ? (d.received / d.total) * 100 : 0
          const dead = d.status === 'cancelled' || d.status === 'interrupted'
          return (
            <div key={d.id} className="card" style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '14px 14px 14px 16px' }}>
              <span className="page-icon" style={{ width: 40, height: 40, borderRadius: 12, opacity: dead ? 0.4 : 1, boxShadow: 'none' }}>
                {d.status === 'completed' ? <FileDown size={19} /> : <Download size={19} />}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    textDecoration: dead ? 'line-through' : undefined,
                    color: dead ? 'var(--text-3)' : undefined,
                    cursor: d.status === 'completed' ? 'pointer' : undefined
                  }}
                  onClick={d.status === 'completed' ? act(d.id, 'open') : undefined}
                >
                  {d.filename}
                </div>
                <div style={{ color: 'var(--text-3)', fontSize: 12, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
                  {hostOf(d.url)} ·{' '}
                  {d.status === 'progressing'
                    ? `${formatBytes(d.received)}${d.total ? ` of ${formatBytes(d.total)}` : ''} · ${formatBytes(d.speed)}/s`
                    : d.status === 'paused'
                      ? 'Paused'
                      : d.status === 'completed'
                        ? `${formatBytes(d.total)} · ${new Date(d.started).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`
                        : d.status === 'cancelled'
                          ? 'Cancelled'
                          : 'Failed — the download was interrupted'}
                </div>
                {running && (
                  <div className="dl-bar">
                    <div style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {d.status === 'completed' && (
                  <>
                    <button className="btn small" onClick={act(d.id, 'open')}>
                      <ExternalLink size={13} /> Open
                    </button>
                    <button className="btn small" onClick={act(d.id, 'show')}>
                      <Folder size={13} /> Show in folder
                    </button>
                  </>
                )}
                {d.status === 'progressing' && (
                  <button className="icon-btn" title="Pause" onClick={act(d.id, 'pause')}>
                    <Pause size={16} />
                  </button>
                )}
                {d.status === 'paused' && (
                  <button className="icon-btn" title="Resume" onClick={act(d.id, 'resume')}>
                    <Play size={16} />
                  </button>
                )}
                {running && (
                  <button className="icon-btn" title="Cancel" onClick={act(d.id, 'cancel')}>
                    <CircleX size={16} />
                  </button>
                )}
                {dead && (
                  <button className="btn small" onClick={act(d.id, 'retry')}>
                    <RefreshCw size={13} /> Retry
                  </button>
                )}
                {!running && (
                  <button className="icon-btn" title="Remove from list" onClick={act(d.id, 'remove')}>
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
