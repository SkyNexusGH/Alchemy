import { Info, Languages, Lock, Mic, Search, ShieldCheck, ShieldOff, Star, TriangleAlert } from '../lib/icons'
import { listen, stopListening, type VoiceState } from '../lib/voice'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { allEngines, engineOf, type EngineInfo, type LocalSuggestions, type Settings, type Suggestion, type TabState } from '@shared/types'
import { prettyUrl, toUrl } from '@shared/url'
import { calculate, formatAnswer } from '@shared/calc'
import { convertUnits } from '@shared/units'
import { api } from '../lib/api'
import { Logo } from '../lib/ui'
import { useSettings } from '../lib/settings'

const ROW_HEIGHT = 40
const PANEL_PAD = 6
const SHADOW = 14

const short = (n: number): string => (n > 99 ? '99+' : String(n))

function ShieldButton({ tab }: { tab: TabState }): React.JSX.Element {
  const split = useSettings((s) => !!s.settings?.splitBlockCounts)
  const style = useSettings((s) => s.settings?.appearance.countStyle ?? 'pill')
  const showCount = tab.shields && tab.blocked > 0 && style !== 'none'
  const ads = tab.blocked - tab.trackers
  const count = split ? (
    <>
      {short(ads)}
      <span className="shield-sep" />
      <span className="shield-trackers">{short(tab.trackers)}</span>
    </>
  ) : (
    short(tab.blocked)
  )
  return (
    <button
      className={`omni-shield${tab.shields ? ' on' : ''}${showCount ? ` has-count count-${style}` : ''}`}
      title={
        !tab.shields
          ? 'Aegis blocker is off for this site'
          : split
            ? `Aegis blocker · ${ads} ads and ${tab.trackers} trackers blocked on this page`
            : `Aegis blocker · ${tab.blocked} blocked on this page`
      }
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        const width = 360
        api.invoke('overlay:show', { x: r.right - width + 14, y: r.bottom + 2, width, height: 420 }, { kind: 'shields', tabId: tab.id }, true)
      }}
    >
      {tab.shields ? <ShieldCheck size={16} /> : <ShieldOff size={16} />}
      {showCount && style !== 'ring' && <span className="shield-count">{count}</span>}
      {showCount && style === 'ring' && (
        // Ring: fills up as more is blocked (full at 50), around the shield.
        <span className="shield-ring" style={{ '--fill': `${Math.min(100, tab.blocked * 2)}%` } as React.CSSProperties} />
      )}
    </button>
  )
}

/** The engine a typed word picks with Tab: its keyword ("yt"), or the start of its name ("wiki"). */
function engineFor(settings: Settings | null, text: string): EngineInfo | null {
  const q = text.trim().toLowerCase()
  if (!settings || !q || /s/.test(q)) return null
  const list = allEngines(settings)
  return list.find((e) => e.keyword.toLowerCase() === q) ?? (q.length >= 2 ? list.find((e) => e.name.toLowerCase().startsWith(q)) : null) ?? null
}

/** "/SkyNexusGH/Alchemy?tab=repos" → ["SkyNexusGH", "Alchemy"]; long paths keep the last parts. */
function breadcrumbs(path: string): string[] {
  const parts = path
    .replace(/[?#].*$/, '')
    .split('/')
    .filter(Boolean)
    .map((p) => {
      try {
        return decodeURIComponent(p)
      } catch {
        return p
      }
    })
  return parts.length > 3 ? ['…', ...parts.slice(-2)] : parts
}

export function Omnibox({ tab }: { tab: TabState | null }): React.JSX.Element {
  const input = useRef<HTMLInputElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const settings = useSettings((s) => s.settings)
  const [focused, setFocused] = useState(false)
  const [text, setText] = useState(tab?.displayUrl ?? '')
  const [items, setItems] = useState<Suggestion[]>([])
  const [selected, setSelected] = useState(0)
  /** Searching with a different engine, picked with keyword + Tab. */
  const [engine, setEngine] = useState<EngineInfo | null>(null)
  const engineRef = useRef<EngineInfo | null>(null)
  engineRef.current = engine

  // What the user actually typed, apart from inline autocomplete.
  const typed = useRef('')
  const editing = useRef(false)
  const local = useRef<Suggestion[]>([])
  const remote = useRef<string[]>([])
  const inline = useRef<string | null>(null)
  const pendingSelection = useRef<[number, number] | null>(null)
  const seq = useRef(0)
  const itemsRef = useRef<Suggestion[]>([])
  const tabRef = useRef(tab)
  tabRef.current = tab
  const blurTimer = useRef<number>(0)
  /** "weather london": its answer, once fetched. */
  const weatherAnswer = useRef<{ query: string; item: Suggestion } | null>(null)
  const [voice, setVoice] = useState<VoiceState>({ kind: 'idle' })

  async function voiceSearch(): Promise<void> {
    if (voice.kind === 'listening') return stopListening()
    if (voice.kind !== 'idle' && voice.kind !== 'error') return
    try {
      const said = await listen(setVoice)
      setVoice({ kind: 'idle' })
      if (!said) return
      const words = said.replace(/[.。!?]+$/, '').trim()
      setText(words)
      go({ kind: toUrl(words) ? 'url' : 'search', title: words, value: words })
    } catch (err) {
      setVoice({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
      setTimeout(() => setVoice({ kind: 'idle' }), 4000)
    }
  }
  const overlayOpen = useRef(false)
  itemsRef.current = items

  // Follow the active tab's URL unless the user is mid-edit.
  useEffect(() => {
    if (!editing.current) setText(tab?.displayUrl ?? '')
  }, [tab?.displayUrl])

  useEffect(() => {
    editing.current = false
    setText(tab?.displayUrl ?? '')
    close()
  }, [tab?.id])

  useLayoutEffect(() => {
    if (pendingSelection.current && input.current) {
      input.current.setSelectionRange(...pendingSelection.current)
      pendingSelection.current = null
    }
  }, [text])

  useEffect(() => {
    const offCommand = api.on('command', (cmd: string) => {
      if (cmd !== 'focus-omnibox') return
      input.current?.focus()
      input.current?.select()
    })
    const offPicked = api.on('overlay:picked', (index: number, mods?: { newTab?: boolean }) => {
      const item = itemsRef.current[index]
      if (item) go(item, !!mods?.newTab)
    })
    const offClosed = api.on('overlay:closed', () => (overlayOpen.current = false))
    return () => {
      offCommand()
      offPicked()
      offClosed()
    }
  }, [])

  // Keep the dropdown in sync with the suggestions.
  useEffect(() => {
    if (!focused || !items.length) {
      close()
      return
    }
    const r = box.current!.getBoundingClientRect()
    const rect = {
      x: r.left - SHADOW,
      y: r.bottom + 4 - 2,
      width: r.width + SHADOW * 2,
      height: items.length * ROW_HEIGHT + PANEL_PAD * 2 + SHADOW + 2
    }
    const payload = { kind: 'omnibox' as const, items, selected }
    if (!overlayOpen.current) {
      overlayOpen.current = true
      api.invoke('overlay:show', rect, payload)
    } else {
      api.invoke('overlay:update', payload)
      api.invoke('overlay:resize', rect.height)
    }
  }, [items, selected, focused])

  function close(): void {
    if (!overlayOpen.current) return
    overlayOpen.current = false
    api.invoke('overlay:hide')
  }

  function rebuild(): void {
    const q = typed.current.trim()
    if (!q) return setItems([])
    const picked = engineRef.current
    const engineName = picked?.name ?? (settings ? engineOf(settings).name : 'Google')
    const tabTo = picked ? null : engineFor(settings, typed.current)
    const first: Suggestion = picked
      ? { kind: 'search', title: q, value: q, detail: `${engineName} search` }
      : inline.current
        ? { kind: 'url', title: inline.current, value: inline.current, detail: 'Go to site' }
        : toUrl(q)
          ? { kind: 'url', title: q, value: q, detail: 'Go to site' }
          : { kind: 'search', title: q, value: q, detail: `${engineName} search` }
    if (tabTo) first.detail = `Press Tab to search ${tabTo.name}`
    // A sum ("128*4.5") gets its answer first; Enter copies it.
    const sum = picked ? null : calculate(q)
    const converted = picked || sum !== null ? null : convertUnits(q)
    const answer: Suggestion | null =
      sum !== null
        ? { kind: 'answer', title: `= ${formatAnswer(sum)}`, value: formatAnswer(sum), detail: 'Press Enter to copy' }
        : converted
          ? { kind: 'answer', title: converted, value: converted.split(' = ')[1], detail: 'Press Enter to copy', favicon: '⇄' }
          : weatherAnswer.current && weatherAnswer.current.query === q.toLowerCase()
            ? weatherAnswer.current.item
            : null
    const out: Suggestion[] = answer ? [answer, first] : [first]
    const seen = new Set([first.value.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')])
    for (const s of picked ? [] : local.current) {
      const key = s.value.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
      if (seen.has(key) || out.length >= 5) continue
      seen.add(key)
      out.push(s)
    }
    for (const r of remote.current) {
      if (r.toLowerCase() === q.toLowerCase() || out.length >= 9) continue
      out.push({ kind: 'suggest', title: r, value: r })
    }
    setItems(out)
    setSelected(0)
  }

  function query(value: string, allowInline: boolean): void {
    const id = ++seq.current
    inline.current = null
    remote.current = []
    if (!value.trim()) {
      local.current = []
      setItems([])
      return
    }
    rebuild()
    const picked = engineRef.current
    if (!picked) api.invoke<LocalSuggestions>('omnibox:local', value).then((res) => {
      if (id !== seq.current) return
      local.current = res.items
      const lower = value.toLowerCase()
      if (allowInline && res.inline && res.inline.startsWith(lower) && res.inline.length > value.length) {
        inline.current = res.inline
        const full = value + res.inline.slice(value.length)
        pendingSelection.current = [value.length, full.length]
        setText(full)
      }
      rebuild()
    })
    // Rich answer: the weather for "weather <city>" or "<city> weather".
    const wq = value
      .trim()
      .toLowerCase()
      .match(/^weather(?:\s+in)?\s+(.{2,})$|^(.{2,}?)\s+weather$/)
    if (!picked && wq) {
      const place = (wq[1] ?? wq[2]).trim()
      api.invoke<{ temp: number; high: number; low: number; code: number; unit: string; place: string } | null>('omnibox:weather', place).then((w) => {
        if (id !== seq.current || !w) return
        const icon =
          w.code === 0 ? '☀️' : w.code <= 2 ? '🌤️' : w.code === 3 ? '☁️' : w.code <= 48 ? '🌫️' : w.code <= 67 || (w.code >= 80 && w.code <= 82) ? '🌧️' : w.code <= 86 ? '🌨️' : '⛈️'
        weatherAnswer.current = {
          query: value.trim().toLowerCase(),
          item: { kind: 'answer', title: `${w.temp}°${w.unit} in ${w.place}`, value: value.trim(), detail: `High ${w.high}° · low ${w.low}°`, favicon: icon }
        }
        rebuild()
      })
    }
    api.invoke<string[]>('omnibox:remote', value, picked?.id).then((list) => {
      if (id !== seq.current) return
      remote.current = list
      rebuild()
    })
  }

  function go(item: Suggestion, newTab = false): void {
    // Sums and conversions copy their answer; a weather answer searches for the forecast.
    if (item.kind === 'answer' && item.detail === 'Press Enter to copy') {
      void navigator.clipboard.writeText(item.value).catch(() => {})
      revert()
      input.current?.blur()
      return
    }
    editing.current = false
    seq.current++
    setItems([])
    close()
    input.current?.blur()
    const searching = item.kind === 'search' || item.kind === 'suggest'
    api.invoke('tab:navigate', item.value, { newTab, engine: searching ? engineRef.current?.id : undefined })
    setEngine(null)
  }

  function revert(): void {
    editing.current = false
    seq.current++
    setItems([])
    setEngine(null)
    // Read the latest tab: this often runs from a timer set before the tab changed.
    setText(tabRef.current?.displayUrl ?? '')
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    // "yt" then Tab: search YouTube instead of the default engine.
    if (e.key === 'Tab' && !e.shiftKey && !engine) {
      const next = engineFor(settings, typed.current)
      if (next) {
        e.preventDefault()
        engineRef.current = next
        setEngine(next)
        typed.current = ''
        inline.current = null
        setText('')
        query('', false)
        return
      }
    }
    if (e.key === 'Backspace' && engine && !input.current!.value) {
      e.preventDefault()
      engineRef.current = null
      setEngine(null)
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!items.length) return
      e.preventDefault()
      const next = (selected + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
      setSelected(next)
      if (next === 0) {
        setText(inline.current ? typed.current + inline.current.slice(typed.current.length) : typed.current)
      } else {
        setText(items[next].value)
      }
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const raw = input.current!.value.trim()
      if (!raw) return
      // Ctrl+Enter: "example" → www.example.com
      if (e.ctrlKey && !/[.\s/:]/.test(raw)) return go({ kind: 'url', title: raw, value: `www.${raw}.com` }, e.altKey)
      const item = items[selected]
      const usesItem = item && (selected > 0 || item.value === raw || inline.current || item.kind === 'answer')
      go(usesItem ? item : { kind: engine ? 'search' : 'url', title: raw, value: raw }, e.altKey)
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      if (items.length || editing.current) revert()
      else api.invoke('tab:activate', tab?.id)
    }
  }

  const display = tab?.displayUrl ?? ''
  const isNewTab = !!tab && !display
  const showPretty = !focused && !!display
  const pretty = prettyUrl(display)
  const slash = pretty.indexOf('/')
  const host = slash === -1 ? pretty : pretty.slice(0, slash)
  const crumbs = breadcrumbs(slash === -1 ? '' : pretty.slice(slash))
  const placeholder =
    voice.kind === 'listening'
      ? 'Listening…'
      : voice.kind === 'downloading'
        ? `Getting the voice model ready (one time) · ${voice.percent}%`
        : voice.kind === 'transcribing'
          ? 'Working out what you said…'
          : voice.kind === 'error'
            ? 'Couldn’t use the microphone'
            : engine
              ? `Search ${engine.name}`
              : `Search ${settings ? engineOf(settings).name : 'Google'} or type a URL`
  // Translate: when the page says it's in another language than yours.
  const myLang = (settings?.translateTo || navigator.language || 'en').toLowerCase().split('-')[0]
  const foreign = !!tab?.pageLang && tab.pageLang.toLowerCase().split(/[-_]/)[0] !== myLang

  return (
    <div ref={box} className={`omnibox${focused ? ' focused' : ''}`}>
      <span className={`omni-security ${tab?.security ?? ''}`}>
        {focused || isNewTab ? (
          <Search size={14} />
        ) : tab?.security === 'secure' ? (
          <Lock size={13} />
        ) : tab?.security === 'insecure' ? (
          <>
            <TriangleAlert size={13} />
            <span className="not-secure">Not secure</span>
          </>
        ) : tab?.security === 'internal' ? (
          <Logo size={14} />
        ) : (
          <Info size={14} />
        )}
      </span>
      {engine && <span className="omni-engine">{engine.name}</span>}
      <div className="omni-field">
        <input
          ref={input}
          className={showPretty ? 'hidden-text' : ''}
          value={text}
          spellCheck={false}
          placeholder={showPretty ? '' : placeholder}
          onMouseDown={(e) => {
            if (document.activeElement === e.currentTarget) return
            e.preventDefault()
            e.currentTarget.focus()
            e.currentTarget.select()
          }}
          onFocus={(e) => {
            window.clearTimeout(blurTimer.current)
            setFocused(true)
            e.currentTarget.select()
          }}
          onBlur={() => {
            // A click in the dropdown blurs us first; give its pick a moment to arrive.
            blurTimer.current = window.setTimeout(() => {
              setFocused(false)
              revert()
            }, 160)
          }}
          onChange={(e) => {
            const value = e.target.value
            const inserting = (e.nativeEvent as InputEvent).inputType?.startsWith('insert') ?? true
            typed.current = value
            editing.current = true
            setText(value)
            query(value, inserting)
          }}
          onKeyDown={onKeyDown}
        />
        {showPretty && (
          // Centred, with the address as parts: github.com › SkyNexusGH › Alchemy
          <div className="omni-pretty" aria-hidden>
            <span className="host">{host}</span>
            {crumbs.map((c, i) => (
              <span key={i} className="crumb">
                <span className="sep">›</span>
                {c}
              </span>
            ))}
          </div>
        )}
      </div>
      {tab && tab.zoom !== 1 && !focused && (
        <button className="omni-chip" title="Reset zoom" onClick={() => api.invoke('zoom:reset')}>
          {Math.round(tab.zoom * 100)}%
        </button>
      )}
      {tab && !focused && (foreign || tab.translated) && (
        <button
          className={`omni-chip translate${tab.translated ? ' on' : ''}`}
          title={tab.translated ? 'Show the original page' : `Translate this page (Google Translate)`}
          onClick={() => api.invoke('tab:translate', tab.id)}
        >
          <Languages size={14} />
          {tab.translated ? 'Original' : 'Translate'}
        </button>
      )}
      {(focused || isNewTab || voice.kind !== 'idle') && (
        <button
          className={`omni-mic ${voice.kind}`}
          title={voice.kind === 'listening' ? 'Stop listening' : 'Search by voice (on this computer, with Whisper)'}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void voiceSearch()}
        >
          <Mic size={15} />
        </button>
      )}
      {tab && /^https?:/.test(tab.displayUrl) && !focused && <ShieldButton tab={tab} />}
      {tab && tab.security !== 'internal' && !focused && (
        <button
          className={`omni-star${tab.bookmarked ? ' on' : ''}`}
          title={tab.bookmarked ? 'Remove bookmark (Ctrl+D)' : 'Bookmark this page (Ctrl+D)'}
          onClick={() => api.invoke('bookmark:toggleActive')}
        >
          <Star size={15} fill={tab.bookmarked ? 'currentColor' : 'none'} />
        </button>
      )}
    </div>
  )
}
