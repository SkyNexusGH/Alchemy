import './pages.css'
import { Clock, Search, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
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

  const load = (q: string, before?: number): void => {
    api.invoke<HistoryVisit[]>('history:query', q, before).then((list) => {
      setVisits((cur) => (before ? [...cur, ...list] : list))
      setMore(list.length >= 300)
    })
  }

  useEffect(() => {
    const t = setTimeout(() => load(query), query ? 120 : 0)
    return () => clearTimeout(t)
  }, [query])

  const groups = useMemo(() => groupByDay(visits), [visits])

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

      {visits.length === 0 && (
        <div className="empty">
          <Clock size={40} />
          <div>{query ? 'No history matches your search.' : 'Pages you visit will show up here.'}</div>
        </div>
      )}

      {groups.map(([label, items]) => (
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

      {more && visits.length > 0 && (
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button className="btn" onClick={() => load(query, visits[visits.length - 1].time)}>
            Show more
          </button>
        </div>
      )}

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
