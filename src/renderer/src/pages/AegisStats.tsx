import type { AegisStats } from '@shared/types'

/**
 * Charts for Settings → Aegis blocker: the last week, what blocking saved you, which
 * companies tried to track you, and your most-blocked sites.
 */

const fmtMinutes = (m: number): string => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`)

/** Bars for the last 7 days, oldest on the left. */
export function WeekChart({ stats }: { stats: AegisStats }): React.JSX.Element {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    const key = d.toISOString().slice(0, 10)
    return { key, label: d.toLocaleDateString([], { weekday: 'short' }), n: stats.days[key] ?? 0 }
  })
  const max = Math.max(1, ...days.map((d) => d.n))
  return (
    <div className="ag-week" role="img" aria-label={`Blocked per day: ${days.map((d) => `${d.label} ${d.n}`).join(', ')}`}>
      {days.map((d, i) => (
        <div key={d.key} className={`ag-day${i === 6 ? ' today' : ''}`}>
          <span className="ag-n">{d.n ? d.n.toLocaleString() : ''}</span>
          <i style={{ height: `${Math.max(3, (d.n / max) * 100)}%` }} />
          <span className="ag-label">{i === 6 ? 'Today' : d.label}</span>
        </div>
      ))}
    </div>
  )
}

/** Time, data and battery the blocker saved, as estimates. */
export function SavedTiles({ stats }: { stats: AegisStats }): React.JSX.Element {
  // Rough, conservative: ~50 ms of loading and ~30 KB of data per blocked request;
  // a laptop battery spends roughly a third of a minute per minute of busy page loading.
  const minutes = Math.round((stats.blocked * 0.05) / 60)
  const mb = Math.round((stats.blocked * 30) / 1024)
  const battery = Math.round(minutes * 0.35)
  return (
    <div className="ag-tiles">
      <div>
        <span className="ag-emoji">⏱</span>
        <b>{fmtMinutes(minutes)}</b>
        <span>time saved</span>
      </div>
      <div>
        <span className="ag-emoji">📶</span>
        <b>{mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`}</b>
        <span>data saved</span>
      </div>
      <div>
        <span className="ag-emoji">🔋</span>
        <b>{fmtMinutes(battery)}</b>
        <span>of battery</span>
      </div>
    </div>
  )
}

/** Bubbles sized by how often each company's requests were blocked. */
export function CompanyBubbles({ stats }: { stats: AegisStats }): React.JSX.Element {
  const list = Object.entries(stats.companies)
    .filter(([name]) => name !== 'Other')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
  if (!list.length) return <div className="ag-empty">Nothing yet. Companies show up here as Aegis blocks their trackers and ads.</div>
  const max = list[0][1]
  return (
    <div className="ag-bubbles">
      {list.map(([name, n], i) => {
        const size = 46 + Math.sqrt(n / max) * 70
        return (
          <div
            key={name}
            className="ag-bubble"
            title={`${name}: ${n.toLocaleString()} blocked`}
            style={{ width: size, height: size, '--h': `${(i * 47) % 360}` } as React.CSSProperties}
          >
            <b>{name}</b>
            <span>{n.toLocaleString()}</span>
          </div>
        )
      })}
    </div>
  )
}

/** Your sites with the most ads and trackers. */
export function TopSites({ stats }: { stats: AegisStats }): React.JSX.Element {
  const list = Object.entries(stats.sites)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
  if (!list.length) return <div className="ag-empty">Nothing yet.</div>
  const max = list[0][1]
  return (
    <div className="ag-sites">
      {list.map(([site, n]) => (
        <div key={site} className="ag-site">
          <span className="ag-site-name">{site}</span>
          <span className="ag-bar">
            <i style={{ width: `${(n / max) * 100}%` }} />
          </span>
          <span className="ag-site-n">{n.toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}
