import { useEffect, useState } from 'react'
import type { Settings } from '@shared/types'
import { api } from '../lib/api'
import { Check, Plus, RotateCcw, X } from '../lib/icons'
import { saveSettings, useSettings } from '../lib/settings'
import { Favicon } from '../lib/ui'

/**
 * The widget board under the shortcuts on the new tab page. Each widget is turned on or
 * off in Settings → New Tab & Search; the board shows the ones that are on, in a grid.
 */
export function WidgetBoard(): React.JSX.Element | null {
  const s = useSettings((st) => st.settings)
  if (!s) return null
  const w = s.widgets
  const on = (Object.keys(w) as (keyof typeof w)[]).filter((k) => w[k])
  if (!on.length) return null
  return (
    <div className="widgets">
      {w.weather && <WeatherWidget s={s} />}
      {w.focus && <TimerWidget s={s} />}
      {w.todo && <TodoWidget s={s} />}
      {w.recent && <RecentWidget />}
      {w.news && <NewsWidget />}
    </div>
  )
}

function Card({ title, wide, children, action }: { title: string; wide?: boolean; children: React.ReactNode; action?: React.ReactNode }): React.JSX.Element {
  return (
    <section className={`widget${wide ? ' wide' : ''}`}>
      <header>
        <span>{title}</span>
        {action}
      </header>
      {children}
    </section>
  )
}

// ---- weather ----------------------------------------------------------------------------

const WEATHER: [number[], string, string][] = [
  [[0], '☀️', 'Clear'],
  [[1, 2], '🌤️', 'Partly cloudy'],
  [[3], '☁️', 'Cloudy'],
  [[45, 48], '🌫️', 'Fog'],
  [[51, 53, 55, 56, 57], '🌦️', 'Drizzle'],
  [[61, 63, 65, 66, 67, 80, 81, 82], '🌧️', 'Rain'],
  [[71, 73, 75, 77, 85, 86], '🌨️', 'Snow'],
  [[95, 96, 99], '⛈️', 'Thunderstorms']
]
const describe = (code: number): [string, string] => {
  const hit = WEATHER.find(([codes]) => codes.includes(code))
  return hit ? [hit[1], hit[2]] : ['🌡️', '']
}

interface Weather {
  temp: number
  high: number
  low: number
  code: number
  rainLater: number
  unit: 'C' | 'F'
  hours: { time: string; temp: number; code: number; rain: number }[]
  days: { date: string; high: number; low: number; code: number; rain: number }[]
  alert: string | null
}

function WeatherWidget({ s }: { s: Settings }): React.JSX.Element {
  const place = s.weatherPlace
  const [data, setData] = useState<Weather | null>(null)
  const [editing, setEditing] = useState(!place)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!place) return
    void api.invoke<Weather | null>('widgets:weather', place.lat, place.lon, s.tempUnit).then(setData)
  }, [place?.lat, place?.lon, s.tempUnit])

  if (editing || !place)
    return (
      <Card title="Weather">
        <PlacePicker
          onPick={(p) => {
            void saveSettings({ weatherPlace: p })
            setEditing(false)
          }}
        />
      </Card>
    )
  const [icon, text] = data ? describe(data.code) : ['', '']
  return (
    <Card
      title="Weather"
      action={
        <button className="w-link" onClick={() => setEditing(true)}>
          {place.name}
        </button>
      }
    >
      {data ? (
        <>
          <button className="w-weather" title={open ? 'Hide the forecast' : 'Show the next hours and days'} onClick={() => setOpen(!open)}>
            <span className="w-weather-icon">{icon}</span>
            <div>
              <b className="w-big">
                {data.temp}°{data.unit}
              </b>
              <div className="w-sub">
                {text} · {data.high}° / {data.low}°{data.rainLater >= 40 ? ` · ${data.rainLater}% chance of rain` : ''}
              </div>
            </div>
          </button>
          {data.alert && <div className="w-alert">⚠ {data.alert}</div>}
          {open && data.hours?.length > 0 && (
            <>
              <div className="w-hours">
                {data.hours.map((h) => (
                  <div key={h.time}>
                    <span className="w-sub">{new Date(h.time).toLocaleTimeString([], { hour: 'numeric' })}</span>
                    <span>{describe(h.code)[0]}</span>
                    <b>{h.temp}°</b>
                  </div>
                ))}
              </div>
              <div className="w-days">
                {data.days.map((d, i) => (
                  <div key={d.date}>
                    <span>{i === 0 ? 'Today' : new Date(`${d.date}T12:00`).toLocaleDateString([], { weekday: 'short' })}</span>
                    <span>{describe(d.code)[0]}</span>
                    <span className="w-sub">{d.rain >= 30 ? `${d.rain}%` : ''}</span>
                    <b>
                      {d.high}° <span className="w-sub">{d.low}°</span>
                    </b>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <div className="shimmer" style={{ height: 42 }} />
      )}
    </Card>
  )
}

function PlacePicker({ onPick }: { onPick: (p: { name: string; lat: number; lon: number }) => void }): React.JSX.Element {
  const [q, setQ] = useState('')
  const [list, setList] = useState<{ name: string; country: string; lat: number; lon: number }[]>([])
  useEffect(() => {
    const t = setTimeout(() => void api.invoke<typeof list>('widgets:places', q).then(setList), 250)
    return () => clearTimeout(t)
  }, [q])
  return (
    <div className="w-place">
      <input className="w-input" placeholder="Type your city" value={q} onChange={(e) => setQ(e.target.value)} />
      {list.map((p) => (
        <button key={`${p.lat},${p.lon}`} className="w-row" onClick={() => onPick({ name: p.name, lat: p.lat, lon: p.lon })}>
          <b>{p.name}</b>
          <span>{p.country}</span>
        </button>
      ))}
    </div>
  )
}

// ---- quote -------------------------------------------------------------------------------

// ---- to-do ---------------------------------------------------------------------------------

function TodoWidget({ s }: { s: Settings }): React.JSX.Element {
  const [text, setText] = useState('')
  const [due, setDue] = useState('')
  const today = new Date().toLocaleDateString('en-CA')
  // Things due soonest first; done ones at the bottom.
  const todos = [...(s.todos ?? [])].sort((a, b) => Number(a.done) - Number(b.done) || (a.due ?? '9999').localeCompare(b.due ?? '9999'))
  const dueLabel = (d: string): { text: string; cls: string } => {
    if (d < today) return { text: 'Overdue', cls: 'late' }
    if (d === today) return { text: 'Today', cls: 'today' }
    const days = Math.round((new Date(`${d}T12:00`).getTime() - new Date(`${today}T12:00`).getTime()) / 86_400_000)
    return { text: days === 1 ? 'Tomorrow' : new Date(`${d}T12:00`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }), cls: '' }
  }
  const pressing = todos.filter((t) => !t.done && t.due && t.due <= today).length
  const save = (list: Settings['todos']): void => void saveSettings({ todos: list })
  return (
    <Card title="To do" action={todos.some((t) => t.done) ? <button className="w-link" onClick={() => save(todos.filter((t) => !t.done))}>Clear done</button> : undefined}>
      {pressing > 0 && <div className="w-alert">{pressing === 1 ? '1 task is' : `${pressing} tasks are`} due today or overdue</div>}
      <div className="w-todos">
        {todos.map((t) => (
          <div key={t.id} className={`w-todo${t.done ? ' done' : ''}`}>
            <button className="w-check" aria-label={t.done ? 'Mark not done' : 'Mark done'} onClick={() => save(todos.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))}>
              {t.done && <Check size={11} strokeWidth={3} />}
            </button>
            <span>{t.text}</span>
            {t.due && !t.done && <span className={`w-due ${dueLabel(t.due).cls}`}>{dueLabel(t.due).text}</span>}
            <button className="w-x" aria-label="Remove" onClick={() => save(todos.filter((x) => x.id !== t.id))}>
              <X size={12} />
            </button>
          </div>
        ))}
        <form
          className="w-add"
          onSubmit={(e) => {
            e.preventDefault()
            if (!text.trim()) return
            save([...todos, { id: String(Date.now()), text: text.trim(), done: false, ...(due ? { due } : {}) }])
            setText('')
            setDue('')
          }}
        >
          <Plus size={13} />
          <input className="w-input bare" placeholder="Add a task" value={text} onChange={(e) => setText(e.target.value)} />
          <input className="w-input bare w-date" type="date" title="Due date (optional)" value={due} onChange={(e) => setDue(e.target.value)} />
        </form>
      </div>
    </Card>
  )
}

// ---- focus timer ------------------------------------------------------------------------

function FocusTimer(): React.JSX.Element {
  const [state, setState] = useState<{ endsAt: number; minutes: number } | null>(null)
  const [, tick] = useState(0)
  useEffect(() => {
    const load = (): void => void api.invoke<typeof state>('widgets:focus').then(setState)
    load()
    const id = setInterval(() => {
      tick((n) => n + 1)
      load()
    }, 1000)
    return () => clearInterval(id)
  }, [])
  const left = state ? Math.max(0, state.endsAt - Date.now()) : 0
  const total = state ? state.minutes * 60_000 : 1
  const mm = String(Math.floor(left / 60000)).padStart(2, '0')
  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0')
  return (
    <>
      <div className="w-focus">
        <span className="w-ring" style={{ '--p': `${state ? (1 - left / total) * 100 : 0}%` } as React.CSSProperties}>
          <b>{state ? `${mm}:${ss}` : '25:00'}</b>
        </span>
        <div className="w-focus-buttons">
          {state ? (
            <button className="btn small" onClick={() => void api.invoke('widgets:focusStop').then(() => setState(null))}>
              Stop
            </button>
          ) : (
            [25, 50, 5].map((m) => (
              <button key={m} className="btn small" onClick={() => void api.invoke('widgets:focusStart', m).then(() => api.invoke<typeof state>('widgets:focus').then(setState))}>
                {m === 5 ? 'Break 5' : `${m} min`}
              </button>
            ))
          )}
        </div>
      </div>
    </>
  )
}

// ---- countdown --------------------------------------------------------------------------

function Countdown({ s }: { s: Settings }): React.JSX.Element {
  const c = s.countdown
  const [editing, setEditing] = useState(!c)
  const [label, setLabel] = useState(c?.label ?? '')
  const [date, setDate] = useState(c?.date ?? '')
  if (editing || !c)
    return (
      <>
        <form
          className="w-place"
          onSubmit={(e) => {
            e.preventDefault()
            if (!label.trim() || !date) return
            void saveSettings({ countdown: { label: label.trim(), date } })
            setEditing(false)
          }}
        >
          <input className="w-input" placeholder="What are you counting down to?" value={label} onChange={(e) => setLabel(e.target.value)} />
          <input className="w-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="btn small primary" type="submit">
            Start countdown
          </button>
        </form>
      </>
    )
  const ms = new Date(`${c.date}T00:00:00`).getTime() - Date.now()
  const days = Math.max(0, Math.ceil(ms / 86_400_000))
  return (
    <>
      <div className="w-countdown">
        <button className="w-link w-countdown-edit" onClick={() => setEditing(true)}>Edit</button>
        <b className="w-huge">{days}</b>
        <div>
          <div className="w-sub">{days === 1 ? 'day until' : 'days until'}</div>
          <b>{c.label}</b>
        </div>
      </div>
    </>
  )
}

/** Focus timer and countdown in one card, with a switch between them. */
function TimerWidget({ s }: { s: Settings }): React.JSX.Element {
  const [mode, setMode] = useState<'focus' | 'countdown'>(() => {
    try {
      return localStorage.getItem('alchemy-timer') === 'countdown' ? 'countdown' : 'focus'
    } catch {
      return 'focus'
    }
  })
  const pick = (m: 'focus' | 'countdown'): void => {
    setMode(m)
    try {
      localStorage.setItem('alchemy-timer', m)
    } catch {
      /* not saved */
    }
  }
  return (
    <Card
      title="Timers"
      action={
        <span className="w-tabs">
          <button className={mode === 'focus' ? 'on' : ''} onClick={() => pick('focus')}>Focus</button>
          <button className={mode === 'countdown' ? 'on' : ''} onClick={() => pick('countdown')}>Countdown</button>
        </span>
      }
    >
      {mode === 'focus' ? <FocusTimer /> : <Countdown s={s} />}
    </Card>
  )
}

// ---- pick up where you left off --------------------------------------------------------

function RecentWidget(): React.JSX.Element | null {
  const [list, setList] = useState<{ title: string; url: string; favicon: string | null }[]>([])
  useEffect(() => void api.invoke<typeof list>('widgets:recent').then(setList), [])
  if (!list.length) return null
  return (
    <Card title="Pick up where you left off">
      <div className="w-list">
        {list.map((t, i) => (
          <button key={`${t.url}${i}`} className="w-row" onClick={() => void api.invoke('widgets:reopen', i)}>
            <Favicon src={t.favicon} url={t.url} size={15} />
            <span>{t.title || t.url}</span>
            <RotateCcw size={12} />
          </button>
        ))}
      </div>
    </Card>
  )
}

// ---- news ------------------------------------------------------------------------------------

const NEWS_KEY = 'alchemy-news'
function newsMemory(): { read: string[]; hidden: string[] } {
  try {
    return { read: [], hidden: [], ...JSON.parse(localStorage.getItem(NEWS_KEY) ?? '{}') }
  } catch {
    return { read: [], hidden: [] }
  }
}

function NewsWidget(): React.JSX.Element {
  const [items, setItems] = useState<{ title: string; link: string; source: string; image: string | null }[] | null>(null)
  const [memory, setMemory] = useState(newsMemory)
  const remember = (next: typeof memory): void => {
    setMemory(next)
    try {
      localStorage.setItem(NEWS_KEY, JSON.stringify({ read: next.read.slice(-300), hidden: next.hidden }))
    } catch {
      /* not kept */
    }
  }
  useEffect(() => void api.invoke<NonNullable<typeof items>>('widgets:news').then(setItems), [])
  return (
    <Card title="News" wide>
      <div className="w-news">
        {items === null &&
          Array.from({ length: 4 }, (_, i) => <div key={i} className="shimmer" style={{ height: 120, borderRadius: 10 }} />)}
        {items?.length === 0 && <div className="w-sub">No headlines right now. Check your feeds in Settings → New Tab & Search.</div>}
        {items
          ?.filter((n) => !memory.hidden.includes(n.source))
          .slice(0, 8)
          .map((n) => (
            <a
              key={n.link}
              className={`w-news-card${memory.read.includes(n.link) ? ' read' : ''}`}
              href={n.link}
              onClick={() => remember({ ...memory, read: [...memory.read, n.link] })}
            >
              {n.image ? <img src={n.image} alt="" loading="lazy" /> : <span className="w-news-noimg">{n.source.charAt(0)}</span>}
              <b>{n.title}</b>
              <span className="w-sub w-news-source">
                {n.source}
                <button
                  className="w-news-hide"
                  title={`Hide ${n.source}`}
                  onClick={(e) => {
                    e.preventDefault()
                    remember({ ...memory, hidden: [...memory.hidden, n.source] })
                  }}
                >
                  Hide
                </button>
              </span>
            </a>
          ))}
        {memory.hidden.length > 0 && (
          <button className="w-link" style={{ gridColumn: '1 / -1', justifySelf: 'start' }} onClick={() => remember({ ...memory, hidden: [] })}>
            Show {memory.hidden.length === 1 ? memory.hidden[0] : `${memory.hidden.length} hidden sources`} again
          </button>
        )}
      </div>
    </Card>
  )
}
