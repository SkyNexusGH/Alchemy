import { useEffect, useState } from 'react'
import type { Settings } from '@shared/types'
import { api } from '../lib/api'
import { Check, Pause, Play, Plus, RotateCcw, X } from '../lib/icons'
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
      {w.quote && <QuoteWidget />}
      {w.focus && <FocusWidget />}
      {w.music && <NowPlayingWidget />}
      {w.stats && <StatsWidget />}
      {w.countdown && <CountdownWidget s={s} />}
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
}

function WeatherWidget({ s }: { s: Settings }): React.JSX.Element {
  const place = s.weatherPlace
  const [data, setData] = useState<Weather | null>(null)
  const [editing, setEditing] = useState(!place)
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
        <div className="w-weather">
          <span className="w-weather-icon">{icon}</span>
          <div>
            <b className="w-big">
              {data.temp}°{data.unit}
            </b>
            <div className="w-sub">
              {text} · {data.high}° / {data.low}°{data.rainLater >= 40 ? ` · ${data.rainLater}% chance of rain` : ''}
            </div>
          </div>
        </div>
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

const QUOTES: [string, string][] = [
  ['The secret of change is to focus all of your energy not on fighting the old, but on building the new.', 'Dan Millman'],
  ['Well begun is half done.', 'Aristotle'],
  ['It always seems impossible until it’s done.', 'Nelson Mandela'],
  ['Simplicity is the ultimate sophistication.', 'Leonardo da Vinci'],
  ['The best way out is always through.', 'Robert Frost'],
  ['What we know is a drop, what we don’t know is an ocean.', 'Isaac Newton'],
  ['Act as if what you do makes a difference. It does.', 'William James'],
  ['Little by little, one travels far.', 'J.R.R. Tolkien'],
  ['Nothing will work unless you do.', 'Maya Angelou'],
  ['Do what you can, with what you have, where you are.', 'Theodore Roosevelt'],
  ['The only way to do great work is to love what you do.', 'Steve Jobs'],
  ['Turn your wounds into wisdom.', 'Oprah Winfrey'],
  ['Everything you can imagine is real.', 'Pablo Picasso'],
  ['Stay hungry, stay foolish.', 'Stewart Brand'],
  ['He who has a why to live can bear almost any how.', 'Friedrich Nietzsche'],
  ['The journey of a thousand miles begins with one step.', 'Lao Tzu'],
  ['Knowing is not enough; we must apply.', 'Johann Wolfgang von Goethe'],
  ['Done is better than perfect.', 'Sheryl Sandberg'],
  ['Make it work, make it right, make it fast.', 'Kent Beck'],
  ['If you want to go fast, go alone. If you want to go far, go together.', 'African proverb'],
  ['Courage is grace under pressure.', 'Ernest Hemingway'],
  ['Quality is not an act, it is a habit.', 'Will Durant'],
  ['The impediment to action advances action. What stands in the way becomes the way.', 'Marcus Aurelius'],
  ['Every artist was first an amateur.', 'Ralph Waldo Emerson'],
  ['Be curious, not judgmental.', 'Walt Whitman'],
  ['You miss 100% of the shots you don’t take.', 'Wayne Gretzky'],
  ['The best time to plant a tree was 20 years ago. The second best time is now.', 'Chinese proverb'],
  ['What you do today can improve all your tomorrows.', 'Ralph Marston'],
  ['Happiness is not something ready made. It comes from your own actions.', 'Dalai Lama'],
  ['Imagination is more important than knowledge.', 'Albert Einstein']
]

function QuoteWidget(): React.JSX.Element {
  // A new quote each day, the same one all day.
  const day = Math.floor(Date.now() / 86_400_000)
  const [text, who] = QUOTES[day % QUOTES.length]
  return (
    <Card title="Quote of the day">
      <p className="w-quote">“{text}”</p>
      <div className="w-sub">— {who}</div>
    </Card>
  )
}

// ---- to-do ---------------------------------------------------------------------------------

function TodoWidget({ s }: { s: Settings }): React.JSX.Element {
  const [text, setText] = useState('')
  const todos = s.todos ?? []
  const save = (list: Settings['todos']): void => void saveSettings({ todos: list })
  return (
    <Card title="To do" action={todos.some((t) => t.done) ? <button className="w-link" onClick={() => save(todos.filter((t) => !t.done))}>Clear done</button> : undefined}>
      <div className="w-todos">
        {todos.map((t) => (
          <div key={t.id} className={`w-todo${t.done ? ' done' : ''}`}>
            <button className="w-check" aria-label={t.done ? 'Mark not done' : 'Mark done'} onClick={() => save(todos.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))}>
              {t.done && <Check size={11} strokeWidth={3} />}
            </button>
            <span>{t.text}</span>
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
            save([...todos, { id: String(Date.now()), text: text.trim(), done: false }])
            setText('')
          }}
        >
          <Plus size={13} />
          <input className="w-input bare" placeholder="Add a task" value={text} onChange={(e) => setText(e.target.value)} />
        </form>
      </div>
    </Card>
  )
}

// ---- focus timer ------------------------------------------------------------------------

function FocusWidget(): React.JSX.Element {
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
    <Card title="Focus timer">
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
    </Card>
  )
}

// ---- now playing ------------------------------------------------------------------------

function NowPlayingWidget(): React.JSX.Element {
  const [np, setNp] = useState<{ tabId: number; title: string; url: string; favicon: string | null; playing: boolean } | null>(null)
  useEffect(() => {
    const load = (): void => void api.invoke<typeof np>('widgets:nowPlaying').then(setNp)
    load()
    const id = setInterval(load, 2000)
    return () => clearInterval(id)
  }, [])
  return (
    <Card title="Now playing">
      {np ? (
        <div className="w-music">
          <button className="w-music-art" title="Go to the tab" onClick={() => void api.invoke('widgets:media', np.tabId, 'show')}>
            <Favicon src={np.favicon} url={np.url} size={22} />
          </button>
          <div className="w-music-text">
            <b>{np.title}</b>
            <span className="w-sub">{new URL(np.url).hostname.replace(/^www\./, '')}</span>
          </div>
          <button
            className="w-play"
            aria-label={np.playing ? 'Pause' : 'Play'}
            onClick={() => void api.invoke('widgets:media', np.tabId, np.playing ? 'pause' : 'play').then(() => setNp({ ...np, playing: !np.playing }))}
          >
            {np.playing ? <Pause size={15} /> : <Play size={15} />}
          </button>
        </div>
      ) : (
        <div className="w-sub">Nothing is playing. Music or videos in any tab show up here.</div>
      )}
    </Card>
  )
}

// ---- Aegis stats ---------------------------------------------------------------------------

function StatsWidget(): React.JSX.Element {
  const [st, setSt] = useState<{ blocked: number; since: number } | null>(null)
  useEffect(() => void api.invoke<typeof st>('shields:stats').then(setSt), [])
  const blocked = st?.blocked ?? 0
  // Rough, conservative estimates: ~50 ms and ~30 KB saved per blocked request.
  const minutes = Math.round((blocked * 0.05) / 60)
  const mb = Math.round((blocked * 30) / 1024)
  return (
    <Card title="Aegis blocker">
      <div className="w-stats">
        <div>
          <b className="w-big">{blocked.toLocaleString()}</b>
          <span className="w-sub">blocked</span>
        </div>
        <div>
          <b className="w-big">{minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes} min`}</b>
          <span className="w-sub">time saved</span>
        </div>
        <div>
          <b className="w-big">{mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`}</b>
          <span className="w-sub">data saved</span>
        </div>
      </div>
    </Card>
  )
}

// ---- countdown --------------------------------------------------------------------------

function CountdownWidget({ s }: { s: Settings }): React.JSX.Element {
  const c = s.countdown
  const [editing, setEditing] = useState(!c)
  const [label, setLabel] = useState(c?.label ?? '')
  const [date, setDate] = useState(c?.date ?? '')
  if (editing || !c)
    return (
      <Card title="Countdown">
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
      </Card>
    )
  const ms = new Date(`${c.date}T00:00:00`).getTime() - Date.now()
  const days = Math.max(0, Math.ceil(ms / 86_400_000))
  return (
    <Card title="Countdown" action={<button className="w-link" onClick={() => setEditing(true)}>Edit</button>}>
      <div className="w-countdown">
        <b className="w-huge">{days}</b>
        <div>
          <div className="w-sub">{days === 1 ? 'day until' : 'days until'}</div>
          <b>{c.label}</b>
        </div>
      </div>
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

function NewsWidget(): React.JSX.Element {
  const [items, setItems] = useState<{ title: string; link: string; source: string; image: string | null }[] | null>(null)
  useEffect(() => void api.invoke<NonNullable<typeof items>>('widgets:news').then(setItems), [])
  return (
    <Card title="News" wide>
      <div className="w-news">
        {items === null &&
          Array.from({ length: 4 }, (_, i) => <div key={i} className="shimmer" style={{ height: 120, borderRadius: 10 }} />)}
        {items?.length === 0 && <div className="w-sub">No headlines right now. Check your feeds in Settings → New Tab & Search.</div>}
        {items?.slice(0, 8).map((n) => (
          <a key={n.link} className="w-news-card" href={n.link}>
            {n.image ? <img src={n.image} alt="" loading="lazy" /> : <span className="w-news-noimg">{n.source.charAt(0)}</span>}
            <b>{n.title}</b>
            <span className="w-sub">{n.source}</span>
          </a>
        ))}
      </div>
    </Card>
  )
}
