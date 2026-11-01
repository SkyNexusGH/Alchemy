import { Info, Lock, Search, ShieldCheck, ShieldOff, Star, TriangleAlert } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { SEARCH_ENGINES, type LocalSuggestions, type Suggestion, type TabState } from '@shared/types'
import { prettyUrl, toUrl } from '@shared/url'
import { api } from '../lib/api'
import { Logo } from '../lib/ui'
import { useSettings } from '../lib/settings'

const ROW_HEIGHT = 40
const PANEL_PAD = 6
const SHADOW = 14

function ShieldButton({ tab }: { tab: TabState }): React.JSX.Element {
  const count = tab.blocked > 99 ? '99+' : String(tab.blocked)
  return (
    <button
      className={`omni-shield${tab.shields ? ' on' : ''}`}
      title={tab.shields ? `Protections on · ${tab.blocked} blocked on this page` : 'Protections off for this site'}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        const width = 360
        api.invoke('overlay:show', { x: r.right - width + 14, y: r.bottom + 2, width, height: 420 }, { kind: 'shields', tabId: tab.id }, true)
      }}
    >
      {tab.shields ? <ShieldCheck size={16} /> : <ShieldOff size={16} />}
      {tab.shields && tab.blocked > 0 && <span className="shield-count">{count}</span>}
    </button>
  )
}

export function Omnibox({ tab }: { tab: TabState | null }): React.JSX.Element {
  const input = useRef<HTMLInputElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const settings = useSettings((s) => s.settings)
  const [focused, setFocused] = useState(false)
  const [text, setText] = useState(tab?.displayUrl ?? '')
  const [items, setItems] = useState<Suggestion[]>([])
  const [selected, setSelected] = useState(0)

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
    const engine = SEARCH_ENGINES[settings?.searchEngine ?? 'google'].name
    const first: Suggestion = inline.current
      ? { kind: 'url', title: inline.current, value: inline.current, detail: 'Go to site' }
      : toUrl(q)
        ? { kind: 'url', title: q, value: q, detail: 'Go to site' }
        : { kind: 'search', title: q, value: q, detail: `${engine} search` }
    const out: Suggestion[] = [first]
    const seen = new Set([first.value.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')])
    for (const s of local.current) {
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
    api.invoke<LocalSuggestions>('omnibox:local', value).then((res) => {
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
    api.invoke<string[]>('omnibox:remote', value).then((list) => {
      if (id !== seq.current) return
      remote.current = list
      rebuild()
    })
  }

  function go(item: Suggestion, newTab = false): void {
    editing.current = false
    seq.current++
    setItems([])
    close()
    input.current?.blur()
    api.invoke('tab:navigate', item.value, { newTab })
  }

  function revert(): void {
    editing.current = false
    seq.current++
    setItems([])
    // Read the latest tab: this often runs from a timer set before the tab changed.
    setText(tabRef.current?.displayUrl ?? '')
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
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
      const usesItem = item && (selected > 0 || item.value === raw || inline.current)
      go(usesItem ? item : { kind: 'url', title: raw, value: raw }, e.altKey)
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
  const [host, rest] = slash === -1 ? [pretty, ''] : [pretty.slice(0, slash), pretty.slice(slash)]
  const placeholder = `Search ${SEARCH_ENGINES[settings?.searchEngine ?? 'google'].name} or type a URL`

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
          <div className="omni-pretty" aria-hidden>
            <span className="host">{host}</span>
            <span className="rest">{rest}</span>
          </div>
        )}
      </div>
      {tab && tab.zoom !== 1 && !focused && (
        <button className="omni-chip" title="Reset zoom" onClick={() => api.invoke('zoom:reset')}>
          {Math.round(tab.zoom * 100)}%
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
