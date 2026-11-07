import './newtab.css'
import { useEffect, useRef, useState } from 'react'
import { allEngines, engineOf, type LocalSuggestions, type SearchEngineId, type SpeedDialItem, type Suggestion } from '@shared/types'
import { hostOf, toUrl } from '@shared/url'
import { api } from '../lib/api'
import { Check, ChevronDown, EngineIcon, Globe, Onion, Plus, Search, VenetianMask, X } from '../lib/icons'
import { backgroundUrl, saveSettings, useSettings } from '../lib/settings'
import { WidgetBoard } from './Widgets'
import { Favicon, setPageIcon } from '../lib/ui'

document.title = 'New Tab'
setPageIcon('<path d="M7.5 3.5l4 4-4 4-4-4z"/><path d="M16.5 3.5l4 4-4 4-4-4z"/><path d="M7.5 12.5l4 4-4 4-4-4z"/><path d="M16.5 12.5l4 4-4 4-4-4z"/>')

export default function NewTab(): React.JSX.Element {
  const settings = useSettings((s) => s.settings)
  const isPrivate = useSettings((s) => s.context.private)
  const isTor = useSettings((s) => !!s.context.tor)
  const dial = settings?.speedDial ?? []
  const [icons, setIcons] = useState<Record<string, string | null>>({})
  const [adding, setAdding] = useState(false)
  const now = useClock()

  useEffect(() => {
    if (isPrivate) document.title = isTor ? 'Alchemy Tor' : 'Masked Mode'
  }, [isPrivate, isTor])
  useEffect(() => {
    if (!dial.length) return
    api.invoke('history:favicons', dial.map((d) => d.url)).then(setIcons)
    // Open connections to the Home zone sites now, so a click skips DNS and TLS setup.
    if (!isPrivate) void api.invoke('speeddial:warm', dial.map((d) => d.url))
  }, [dial.map((d) => d.url).join(), isPrivate])

  if (!settings) return <div className="ntp" />
  const a = settings.appearance
  // Masked Mode always has its own background (the masquerade mask).
  const bg = isPrivate ? '/backgrounds/masked.jpg' : backgroundUrl(settings)
  const remove = (id: string): void => void saveSettings({ speedDial: dial.filter((d) => d.id !== id) })

  return (
    <div className={`ntp${bg ? ' has-bg' : ''}${isPrivate ? ' masked' : ''}`}>
      {bg && <div className="ntp-bg" style={{ backgroundImage: `url("${bg}")` }} />}
      {bg && !isPrivate && <div className="ntp-dim" style={{ opacity: a.backgroundDim / 100 }} />}

      {!isPrivate && <DefaultBrowserCard />}

      <div className="ntp-center">
        {a.showClock && (
          <>
            <div className="date">{now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</div>
            <Clock now={now} style={a.clockStyle ?? 'classic'} />
            <div className="greeting">{greeting(now)}</div>
          </>
        )}

        {a.showSearch && <SearchBox engine={settings.searchEngine} />}

        {isPrivate && (
          <div className="private-card">
            <span className="mask-badge">
              {isTor ? <Onion size={22} /> : <VenetianMask size={22} />}
            </span>
            <div>
              {isTor ? (
                <>
                  <button className="hide-ip-open tor-identity" onClick={() => void api.invoke('tor:newIdentity')}>
                    New identity
                  </button>
                  <b>You’re using Alchemy Tor</b>
                  <p>
                    This window goes through the Tor network, so sites and your internet provider can’t see your real IP
                    address, and Alchemy forgets everything from it when you close it. It’s slower than normal browsing.
                    For the strongest protection against tracking, use Tor Browser.
                  </p>
                </>
              ) : (
                <>
                  <b>You’re in Masked Mode</b>
                  <p>
                    When you close every Masked Mode window, Alchemy forgets its history, cookies, site data and form
                    entries. Downloads and bookmarks are kept.
                  </p>
                  <HideIpRow />
                </>
              )}
            </div>
          </div>
        )}

        {a.showSpeedDial && (
          <div className="dial">
            {dial.map((d) => (
              <a
                key={d.id}
                className="tile"
                href={d.url}
                onPointerEnter={() => !isPrivate && void api.invoke('speeddial:warm', [d.url], true)}
              >
                <span className="tile-icon">
                  {/* The site's own colors, blurred into a soft glow behind its icon. */}
                  {icons[d.url] && <span className="tile-glow" style={{ backgroundImage: `url("${icons[d.url]}")` }} />}
                  <Favicon src={icons[d.url]} url={d.url} size={38} />
                </span>
                <span className="tile-title">{d.title || hostOf(d.url)}</span>
                <button
                  className="tile-remove"
                  title="Remove"
                  onClick={(e) => {
                    e.preventDefault()
                    remove(d.id)
                  }}
                >
                  <X size={12} strokeWidth={2.4} />
                </button>
              </a>
            ))}
            <button className="tile add" onClick={() => setAdding(true)}>
              <span className="tile-icon">
                <Plus size={20} />
              </span>
              <span className="tile-title">Add</span>
            </button>
          </div>
        )}
        {!isPrivate && <WidgetBoard />}
      </div>

      {adding && (
        <AddSite
          onClose={(item) => {
            setAdding(false)
            if (item) saveSettings({ speedDial: [...dial, item] })
          }}
        />
      )}
    </div>
  )
}

/** The "Hide my IP in Masked Mode" setting, right where it matters. */
function HideIpRow(): React.JSX.Element | null {
  const on = useSettings((s) => !!s.settings?.maskedUsesTor)
  return (
    <div className="hide-ip">
      <div className="hide-ip-text">
        <span className="hide-ip-label">Hide my IP address</span>
        <span className="hide-ip-hint">
          {on
            ? 'New Masked Mode windows go through Tor. This window still shows your real IP.'
            : 'Sites and your internet provider can see your real IP here. Turn this on and new Masked Mode windows go through Tor.'}
        </span>
      </div>
      {on && (
        <button type="button" className="hide-ip-open" onClick={() => void api.invoke('window:newPrivate')}>
          Open one
        </button>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Hide my IP address in new Masked Mode windows"
        className="switch"
        onClick={() => void saveSettings({ maskedUsesTor: !on })}
      />
    </div>
  )
}

function greeting(now: Date): string {
  const h = now.getHours()
  if (h >= 5 && h < 12) return 'Good morning'
  if (h >= 12 && h < 18) return 'Good afternoon'
  if (h >= 18 && h < 23) return 'Good evening'
  return 'Up late'
}

/** A gentle reminder while Alchemy isn't the default browser (turn off in Settings). */
function DefaultBrowserCard(): React.JSX.Element | null {
  const [show, setShow] = useState(false)
  useEffect(() => {
    void api.invoke<{ isDefault: boolean; prompt: boolean }>('defaultbrowser:status').then((s) => setShow(s.prompt && !s.isDefault))
  }, [])
  if (!show) return null
  const dismiss = (forever: boolean): void => {
    setShow(false)
    void api.invoke('defaultbrowser:dismiss', forever)
  }
  return (
    <div className="default-card">
      <span>Make Alchemy your default browser?</span>
      <button className="btn primary small" onClick={() => {
        void api.invoke('defaultbrowser:open')
        dismiss(false)
      }}>
        Set as default
      </button>
      <button className="btn small" onClick={() => dismiss(true)}>
        Don’t ask again
      </button>
      <button className="dc-close" title="Not now" onClick={() => dismiss(false)}>
        <X size={13} strokeWidth={2.4} />
      </button>
    </div>
  )
}

/**
 * The new tab search box: pick an engine at the start, get suggestions from history,
 * bookmarks and the engine as you type, and search (or go to an address) with Enter.
 */
function SearchBox({ engine }: { engine: SearchEngineId }): React.JSX.Element {
  const [text, setText] = useState('')
  const [items, setItems] = useState<Suggestion[]>([])
  const [selected, setSelected] = useState(-1)
  const [focused, setFocused] = useState(false)
  const [picking, setPicking] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const seq = useRef(0)
  const settings = useSettings((s) => s.settings)!
  const engineName = engineOf(settings, engine).name

  useEffect(() => {
    const q = text.trim()
    const id = ++seq.current
    if (!q) return setItems([])
    let local: Suggestion[] = []
    let remote: Suggestion[] = []
    const merge = (): void => {
      if (id !== seq.current) return
      const seen = new Set<string>()
      setItems(
        [...local.slice(0, 3), ...remote]
          .filter((s) => (seen.has(s.value) ? false : (seen.add(s.value), true)))
          .slice(0, 7)
      )
    }
    void api.invoke<LocalSuggestions>('omnibox:local', q).then((r) => {
      local = r.items
      merge()
    })
    void api.invoke<string[]>('omnibox:remote', q, engine).then((list) => {
      remote = list.map((s) => ({ kind: 'suggest' as const, title: s, value: s }))
      merge()
    })
    setSelected(-1)
  }, [text, engine])

  const go = (value: string): void => {
    if (!value.trim()) return
    void api.invoke('page:search', value, engine)
  }
  const showList = focused && items.length > 0
  const url = toUrl(text)

  return (
    <div className={`searchbox${showList ? ' open' : ''}`}>
      <div className="sb-row">
        <div className="sb-engine">
          <button
            className="sb-engine-btn"
            title={`Searching with ${engineName}`}
            onClick={() => setPicking(!picking)}
            onBlur={() => setTimeout(() => setPicking(false), 120)}
          >
            <EngineIcon id={engine} size={18} />
            <ChevronDown size={13} />
          </button>
          {picking && (
            <div className="sb-engines">
              {allEngines(settings).map(({ id, name }) => (
                <button
                  key={id}
                  className={id === engine ? 'on' : ''}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    void saveSettings({ searchEngine: id })
                    setPicking(false)
                    input.current?.focus()
                  }}
                >
                  <EngineIcon id={id} size={16} />
                  <span>{name}</span>
                  {id === engine && <Check size={14} strokeWidth={2.4} />}
                </button>
              ))}
            </div>
          )}
        </div>
        <input
          ref={input}
          value={text}
          spellCheck={false}
          placeholder={`Search ${engineName} or type a URL`}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              if (!items.length) return
              e.preventDefault()
              const n = items.length + 1
              const next = ((selected + 1 + (e.key === 'ArrowDown' ? 1 : -1) + n) % n) - 1
              setSelected(next)
            } else if (e.key === 'Enter') {
              go(selected >= 0 ? items[selected].value : text)
            } else if (e.key === 'Escape') {
              setText('')
            }
          }}
        />
        <button className="sb-go" title="Search" onClick={() => go(text)}>
          {url ? <Globe size={18} /> : <Search size={18} />}
        </button>
      </div>
      {showList && (
        <div className="sb-list">
          {items.map((s, i) => (
            <div
              key={`${s.kind}:${s.value}`}
              className={`sb-item${i === selected ? ' on' : ''}`}
              onMouseEnter={() => setSelected(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                go(s.value)
              }}
            >
              <span className="sb-icon">
                {s.kind === 'suggest' ? <Search size={15} /> : <Favicon src={s.favicon} url={s.value} size={16} />}
              </span>
              <span className="sb-title">{s.title}</span>
              {s.detail && <span className="sb-detail">{s.detail}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AddSite({ onClose }: { onClose: (item: SpeedDialItem | null) => void }): React.JSX.Element {
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const resolved = toUrl(url)

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose(null)}>
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault()
          if (resolved) onClose({ id: crypto.randomUUID(), title: title.trim() || hostOf(resolved), url: resolved })
        }}
      >
        <h2>Add to Home zone</h2>
        <p>Pin a site to your new tab page.</p>
        <div className="stack">
          <input className="field" autoFocus placeholder="Address, e.g. fivenova.org" value={url} onChange={(e) => setUrl(e.target.value)} />
          <input className="field" placeholder="Name (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="buttons">
          <button type="button" className="btn" onClick={() => onClose(null)}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!resolved}>
            Add
          </button>
        </div>
      </form>
    </div>
  )
}

const HOUR_WORDS = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven']
const MINUTE_WORDS: Record<number, string> = { 5: 'five', 10: 'ten', 15: 'quarter', 20: 'twenty', 25: 'twenty-five', 30: 'half' }

/** "It's ten past five", rounded to the nearest five minutes. */
function timeInWords(d: Date): string {
  const m = Math.round(d.getMinutes() / 5) * 5
  const h = d.getHours() + (m > 30 ? 1 : 0)
  const hour = HOUR_WORDS[h % 12]
  if (m === 0 || m === 60) return `It’s ${hour} o’clock`
  return m <= 30 ? `It’s ${MINUTE_WORDS[m]} past ${hour}` : `It’s ${MINUTE_WORDS[60 - m]} to ${hour}`
}

/** The new tab clock, in the style picked in Settings → New Tab & Search. */
function Clock({ now, style }: { now: Date; style: string }): React.JSX.Element {
  if (style === 'analog') {
    const s = now.getSeconds()
    const m = now.getMinutes() + s / 60
    const h = (now.getHours() % 12) + m / 60
    const hand = (deg: number, length: number, width: number, cls: string): React.JSX.Element => (
      <line className={cls} x1="50" y1="50" x2="50" y2={50 - length} strokeWidth={width} strokeLinecap="round" transform={`rotate(${deg} 50 50)`} />
    )
    return (
      <svg className="clock-analog" viewBox="0 0 100 100" role="img" aria-label={now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}>
        <circle cx="50" cy="50" r="48" className="face" />
        {Array.from({ length: 12 }, (_, i) => (
          <line key={i} x1="50" y1="6" x2="50" y2={i % 3 === 0 ? 13 : 10} className="tick" transform={`rotate(${i * 30} 50 50)`} />
        ))}
        {hand(h * 30, 24, 3.4, 'hour')}
        {hand(m * 6, 35, 2.2, 'minute')}
        {/* The second hand sweeps smoothly: one turn a minute, started at the current second. */}
        <g className="second-sweep" style={{ animationDelay: `-${s + now.getMilliseconds() / 1000}s` }}>
          <line className="second" x1="50" y1="58" x2="50" y2="12" strokeWidth={1} strokeLinecap="round" />
        </g>
        <circle cx="50" cy="50" r="2.4" className="pin" />
      </svg>
    )
  }
  if (style === 'words') return <div className="clock clock-words">{timeInWords(now)}</div>
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: style === 'seconds' ? '2-digit' : undefined })
  return <div className={`clock${style === 'bold' ? ' clock-bold' : ''}`}>{time}</div>
}

function useClock(): Date {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}
