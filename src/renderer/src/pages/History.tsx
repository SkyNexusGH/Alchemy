import './pages.css'
import { Clock, Search, Trash2, X } from '../lib/icons'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { HistoryVisit } from '@shared/types'
import { hostOf } from '@shared/url'
import { api } from '../lib/api'
import { Favicon, setPageIcon } from '../lib/ui'
import { ClearDataDialog } from './ClearDataDialog'

document.title = 'History'
setPageIcon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>')

export default function History(): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [visits, setVisits] = useState<HistoryVisit[]>([])
  const [more, setMore] = useState(true)
  const [clearing, setClearing] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [view, setView] = useState<'recent' | 'week' | 'all'>('recent')
  const [top, setTop] = useState<{ url: string; title: string; favicon: string | null; visits: number }[]>([])
  useEffect(() => {
    if (view !== 'recent') void api.invoke<typeof top>('history:mostVisited', view).then(setTop)
  }, [view])
  // #334 Older days load as you scroll down.
  const sentinel = useRef<HTMLDivElement>(null)
  const loading = useRef(false)

  const load = (q: string, before?: number): void => {
    loading.current = true
    api.invoke<HistoryVisit[]>('history:query', q, before).then((list) => {
      setVisits((cur) => (before ? [...cur, ...list] : list))
      setMore(list.length >= 300)
      setLoaded(true)
      loading.current = false
    })
  }

  useEffect(() => {
    const t = setTimeout(() => load(query), query ? 120 : 0)
    return () => clearTimeout(t)
  }, [query])

  const groups = useMemo(() => groupByDay(visits), [visits])
  useEffect(() => {
    const el = sentinel.current
    if (!el || !more || view !== 'recent') return
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !loading.current && visits.length) load(query, visits[visits.length - 1].time)
    }, { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [visits, more, query, view])

  return (
    <div className="page">
      <div className="page-head">
        <span className="page-icon">
          <Clock size={22} />
        </span>
        <h1>History</h1>
        <span className="spacer" />
        <label className="search-field">
          <Search size={15} />
          <input className="field" placeholder="Search history" value={query} autoFocus onChange={(e) => setQuery(e.target.value)} />
        </label>
        <button className="btn" onClick={() => setClearing(true)}>
          <Trash2 size={15} />
          Clear data
        </button>
      </div>

      <div className="segmented" style={{ marginBottom: 18 }}>
        {(
          [
            ['recent', 'Recent'],
            ['week', 'Most visited this week'],
            ['all', 'Most visited of all time']
          ] as const
        ).map(([id, label]) => (
          <button key={id} className={view === id ? 'on' : ''} onClick={() => setView(id)}>
            {label}
          </button>
        ))}
      </div>

      {view !== 'recent' && (
        <div className="card" style={{ padding: 6 }}>
          {top.length === 0 && <div className="empty" style={{ padding: 40 }}>Nothing here yet.</div>}
          {top.map((t, i) => (
            <div className="row" key={t.url}>
              <span className="time">{i + 1}</span>
              <Favicon src={t.favicon} url={t.url} size={16} />
              <a className="title" href={t.url}>
                {t.title}
              </a>
              <span className="sub">
                {t.visits.toLocaleString()} visit{t.visits === 1 ? '' : 's'}
              </span>
            </div>
          ))}
        </div>
      )}

      {!loaded && (
        <div className="loading-rows" aria-label="Loading history">
          {[70, 52, 64, 45, 58].map((w, i) => (
            <div key={i} className="loading-row">
              <span className="shimmer" style={{ width: 16, height: 16 }} />
              <span className="shimmer" style={{ width: `${w}%`, height: 10 }} />
            </div>
          ))}
        </div>
      )}

      {view === 'recent' && loaded && visits.length === 0 && (
        <div className="empty">
          <Clock size={40} />
          <div>{query ? 'No history matches your search.' : 'Pages you visit will show up here.'}</div>
        </div>
      )}

      {view === 'recent' && groups.map(([label, items]) => (
        <section key={label}>
          <div className="group-title">{label}</div>
          <div className="card" style={{ padding: 6 }}>
            {items.map((v) => (
              <div className="row" key={`${v.url}@${v.time}`}>
                <span className="time">{new Date(v.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <Favicon src={v.favicon} url={v.url} size={16} />
                <a className="title" href={v.url} title={v.url}>
                  {v.title || v.url}
                </a>
                <span className="sub">{hostOf(v.url)}</span>
                <span className="actions">
                  <button
                    className="icon-btn"
                    title="Remove from history"
                    onClick={() => {
                      api.invoke('history:delete', v.url, v.time)
                      setVisits((cur) => cur.filter((x) => x !== v))
                    }}
                  >
                    <X size={15} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}

      {view === 'recent' && more && visits.length > 0 && <div ref={sentinel} className="loading-more">Loading older days…</div>}

      {clearing && (
        <ClearDataDialog
          onClose={(cleared) => {
            setClearing(false)
            if (cleared) load(query)
          }}
        />
      )}
    </div>
  )
}

function groupByDay(visits: HistoryVisit[]): [string, HistoryVisit[]][] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const groups = new Map<string, HistoryVisit[]>()
  for (const v of visits) {
    const d = new Date(v.time)
    d.setHours(0, 0, 0, 0)
    const days = Math.round((today.getTime() - d.getTime()) / 86_400_000)
    const label =
      days === 0
        ? 'Today'
        : days === 1
          ? 'Yesterday'
          : d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: days > 300 ? 'numeric' : undefined })
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label)!.push(v)
  }
  return [...groups]
}
