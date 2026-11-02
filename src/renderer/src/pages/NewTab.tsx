import './newtab.css'
import { useEffect, useRef, useState } from 'react'
import { SEARCH_ENGINES, type LocalSuggestions, type SearchEngineId, type SpeedDialItem, type Suggestion } from '@shared/types'
import { hostOf, toUrl } from '@shared/url'
import { api } from '../lib/api'
import { Check, ChevronDown, EngineIcon, Globe, Plus, Search, VenetianMask, X } from '../lib/icons'
import { backgroundUrl, saveSettings, useSettings } from '../lib/settings'
import { Favicon, setPageIcon } from '../lib/ui'

document.title = 'New Tab'
setPageIcon('<path d="M7.5 3.5l4 4-4 4-4-4z"/><path d="M16.5 3.5l4 4-4 4-4-4z"/><path d="M7.5 12.5l4 4-4 4-4-4z"/><path d="M16.5 12.5l4 4-4 4-4-4z"/>')

export default function NewTab(): React.JSX.Element {
  const settings = useSettings((s) => s.settings)
  const isPrivate = useSettings((s) => s.context.private)
  const dial = settings?.speedDial ?? []
  const [icons, setIcons] = useState<Record<string, string | null>>({})
  const [adding, setAdding] = useState(false)
  const now = useClock()

  useEffect(() => {
    if (isPrivate) document.title = 'Private Tab'
  }, [isPrivate])
  useEffect(() => {
    if (!dial.length) return
    api.invoke('history:favicons', dial.map((d) => d.url)).then(setIcons)
    // Open connections to the speed dial sites now, so a click skips DNS and TLS setup.
    if (!isPrivate) void api.invoke('speeddial:warm', dial.map((d) => d.url))
  }, [dial.map((d) => d.url).join(), isPrivate])

  if (!settings) return <div className="ntp" />
  const a = settings.appearance
  const bg = isPrivate ? null : backgroundUrl(settings)
  const remove = (id: string): void => void saveSettings({ speedDial: dial.filter((d) => d.id !== id) })

  return (
    <div className={`ntp${bg ? ' has-bg' : ''}`}>
      {bg && <div className="ntp-bg" style={{ backgroundImage: `url("${bg}")` }} />}
      {bg && <div className="ntp-dim" style={{ opacity: a.backgroundDim / 100 }} />}

      <div className="ntp-center">
        {a.showClock && (
          <>
            <div className="clock">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            <div className="date">{now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</div>
          </>
        )}

        {a.showSearch && <SearchBox engine={settings.searchEngine} />}

        {isPrivate && (
          <div className="private-card">
            <VenetianMask size={22} />
            <div>
              <b>You're browsing privately</b>
              <p>
                Ovyra won't keep your history, cookies, site data or form entries once you close all private windows.
                Downloads and bookmarks you make are kept. Sites, your employer or your internet provider can still see
                what you visit.
              </p>
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
                  <Favicon src={icons[d.url]} url={d.url} size={30} />
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
                <Plus size={22} />
              </span>
              <span className="tile-title">Add site</span>
            </button>
          </div>
        )}
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
            title={`Searching with ${SEARCH_ENGINES[engine].name}`}
            onClick={() => setPicking(!picking)}
            onBlur={() => setTimeout(() => setPicking(false), 120)}
          >
            <EngineIcon id={engine} size={18} />
            <ChevronDown size={13} />
          </button>
          {picking && (
            <div className="sb-engines">
              {(Object.keys(SEARCH_ENGINES) as SearchEngineId[]).map((id) => (
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
                  <span>{SEARCH_ENGINES[id].name}</span>
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
          placeholder={`Search ${SEARCH_ENGINES[engine].name} or type a URL`}
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
        <h2>Add to speed dial</h2>
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

function useClock(): Date {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}
