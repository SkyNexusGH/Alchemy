import {
  AppWindow,
  Bookmark,
  BookmarkPlus,
  Clock,
  Code,
  Columns2,
  Copy,
  Download,
  Expand,
  Globe,
  PanelTop,
  Pin,
  Plus,
  Pipette,
  Printer,
  Puzzle,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Shield,
  ShieldOff,
  Store,
  TextSearch,
  VenetianMask,
  X,
  ZoomIn,
  ZoomOut,
  WorkspaceIcon
} from '../lib/icons'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { engineOf, type LocalSuggestions, type TabState } from '@shared/types'
import { inkOn } from '../lib/color'
import { toUrl } from '@shared/url'
import { api } from '../lib/api'
import { useSettings } from '../lib/settings'
import { Favicon } from '../lib/ui'

interface Item {
  key: string
  group: string
  title: string
  detail?: string
  keywords?: string
  shortcut?: string
  icon: ReactNode
  cmd: string
  arg?: string
}

const COMMANDS: Omit<Item, 'group' | 'key'>[] = [
  { title: 'New tab', cmd: 'new-tab', shortcut: 'Ctrl+T', icon: <Plus size={16} /> },
  { title: 'New window', cmd: 'new-window', shortcut: 'Ctrl+N', icon: <AppWindow size={16} /> },
  { title: 'New private window', cmd: 'new-private', shortcut: 'Ctrl+Shift+N', keywords: 'incognito', icon: <VenetianMask size={16} /> },
  { title: 'Reopen closed tab', cmd: 'reopen-tab', shortcut: 'Ctrl+Shift+T', keywords: 'undo restore', icon: <RotateCcw size={16} /> },
  { title: 'Close tab', cmd: 'close-tab', shortcut: 'Ctrl+W', icon: <X size={16} /> },
  { title: 'Split view', cmd: 'split-view', keywords: 'side by side tile two tabs', icon: <Columns2 size={16} /> },
  { title: 'Pin / unpin tab', cmd: 'pin-tab', icon: <Pin size={16} /> },
  { title: 'Duplicate tab', cmd: 'duplicate-tab', icon: <Copy size={16} /> },
  { title: 'Bookmark this page', cmd: 'bookmark', shortcut: 'Ctrl+D', icon: <BookmarkPlus size={16} /> },
  { title: 'Find in page', cmd: 'find', shortcut: 'Ctrl+F', icon: <TextSearch size={16} /> },
  { title: 'History', cmd: 'history', shortcut: 'Ctrl+H', icon: <Clock size={16} /> },
  { title: 'Bookmarks', cmd: 'bookmarks', shortcut: 'Ctrl+Shift+O', icon: <Bookmark size={16} /> },
  { title: 'Downloads', cmd: 'downloads', shortcut: 'Ctrl+J', icon: <Download size={16} /> },
  { title: 'Show / hide bookmarks bar', cmd: 'bookmarks-bar', shortcut: 'Ctrl+Shift+B', icon: <PanelTop size={16} /> },
  { title: 'Settings', cmd: 'settings', keywords: 'preferences options', icon: <Settings size={16} /> },
  { title: 'Extensions', cmd: 'extensions', keywords: 'add-ons plugins', icon: <Puzzle size={16} /> },
  { title: 'Get extensions (Chrome Web Store)', cmd: 'web-store', keywords: 'add-ons install', icon: <Store size={16} /> },
  { title: 'Turn protections off/on for this site', cmd: 'site-shields', keywords: 'shield adblock allow', icon: <ShieldOff size={16} /> },
  { title: 'Turn ad blocking off/on everywhere', cmd: 'toggle-adblock', keywords: 'shield ads', icon: <Shield size={16} /> },
  { title: 'Update ad-block filter lists', cmd: 'update-filters', icon: <RefreshCw size={16} /> },
  { title: 'Zoom in', cmd: 'zoom-in', shortcut: 'Ctrl+=', icon: <ZoomIn size={16} /> },
  { title: 'Zoom out', cmd: 'zoom-out', shortcut: 'Ctrl+-', icon: <ZoomOut size={16} /> },
  { title: 'Reset zoom', cmd: 'zoom-reset', shortcut: 'Ctrl+0', icon: <Search size={16} /> },
  { title: 'Print', cmd: 'print', shortcut: 'Ctrl+P', icon: <Printer size={16} /> },
  { title: 'Full screen', cmd: 'fullscreen', shortcut: 'F11', icon: <Expand size={16} /> },
  { title: 'Pick a color from the page', cmd: 'color-picker', keywords: 'eyedropper hex colour', icon: <Pipette size={16} /> },
  { title: 'Developer tools', cmd: 'devtools', shortcut: 'F12', keywords: 'inspect console', icon: <Code size={16} /> }
]

/** Higher is better; null means no match. Prefix > word start > substring > in-order letters. */
function score(text: string, query: string): number | null {
  const t = text.toLowerCase()
  const q = query.toLowerCase().trim()
  if (!q) return 1
  const i = t.indexOf(q)
  if (i === 0) return 100
  if (i > 0) return t[i - 1] === ' ' ? 80 : 60
  let at = 0
  for (const c of q) {
    at = t.indexOf(c, at) + 1
    if (!at) return null
  }
  return 20
}

export function Palette({ onFit }: { onFit: (h: number) => void }): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [tabs, setTabs] = useState<(TabState & { workspaceId: string })[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [found, setFound] = useState<LocalSuggestions>({ items: [], inline: null })
  const settings = useSettings((s) => s.settings)
  const panel = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.invoke<{ tabs: (TabState & { workspaceId: string })[]; activeId: number | null }>('palette:data').then((d) => {
      setTabs(d.tabs)
      setActiveId(d.activeId)
    })
  }, [])

  useEffect(() => {
    if (!query.trim()) return setFound({ items: [], inline: null })
    const id = setTimeout(() => api.invoke<LocalSuggestions>('omnibox:local', query).then(setFound), 60)
    return () => clearTimeout(id)
  }, [query])

  const items = useMemo(() => {
    const ws = new Map(settings?.workspaces.map((w) => [w.id, w]) ?? [])
    const pool: (Item & { score: number })[] = []
    const add = (item: Item, text: string, boost = 0): void => {
      const s = score(text, query)
      // Open tabs win ties, but only on real (word/substring) matches, not scattered letters.
      if (s !== null) pool.push({ ...item, score: s + (s >= 60 ? boost : 0) })
    }
    for (const t of tabs) {
      if (t.id === activeId) continue
      const w = ws.get(t.workspaceId)
      add(
        {
          key: `tab:${t.id}`,
          group: 'Open tabs',
          title: t.title,
          detail: (settings?.workspaces.length ?? 0) > 1 && w ? `${w.icon || '●'} ${w.name}` : t.displayUrl.replace(/^https?:\/\//, ''),
          icon: <Favicon src={t.favicon} url={t.displayUrl} size={16} />,
          cmd: 'tab',
          arg: String(t.id)
        },
        `${t.title} ${t.displayUrl}`,
        query ? 15 : 0
      )
    }
    for (const c of COMMANDS) add({ ...c, key: `cmd:${c.cmd}`, group: 'Commands' }, `${c.title} ${c.keywords ?? ''}`)
    for (const w of settings?.workspaces ?? []) {
      const accent = w.accent ?? settings?.appearance.accent ?? '#ec4856'
      add(
        {
          key: `ws:${w.id}`,
          group: 'Workspaces',
          title: `Switch to ${w.name}`,
          icon: (
            <span className="pal-ws" style={{ background: accent, color: inkOn(accent) }}>
              {w.icon ? <WorkspaceIcon id={w.icon} size={13} /> : w.name.charAt(0)}
            </span>
          ),
          cmd: 'workspace',
          arg: w.id
        },
        `workspace ${w.name}`
      )
    }
    for (const p of settings?.panels ?? []) {
      add(
        { key: `panel:${p.id}`, group: 'Sidebar', title: `Open ${p.title}`, icon: <Favicon url={p.url} size={16} />, cmd: 'panel', arg: p.id },
        `${p.title} sidebar messenger`
      )
    }
    if (query.trim()) {
      for (const s of found.items) {
        pool.push({
          key: `hist:${s.value}`,
          group: 'Bookmarks & history',
          title: s.title,
          detail: s.detail,
          icon: <Favicon src={s.favicon} url={s.value} size={16} />,
          cmd: 'open',
          arg: s.value,
          score: 30
        })
      }
      const url = toUrl(query)
      pool.push({
        key: 'go',
        group: 'Go',
        title: url ? `Go to ${query.trim()}` : `Search ${(settings ? engineOf(settings).name : 'Google')} for “${query.trim()}”`,
        icon: url ? <Globe size={16} /> : <Search size={16} />,
        cmd: 'open',
        arg: query.trim(),
        score: 10
      })
    }
    // Without a query: tabs first, then commands. With one: best matches first.
    if (query.trim()) pool.sort((a, b) => b.score - a.score)
    return pool.slice(0, 60)
  }, [tabs, activeId, settings, query, found])

  useEffect(() => setSelected(0), [query])
  useLayoutEffect(() => {
    if (panel.current) onFit(panel.current.offsetHeight)
  })
  useEffect(() => {
    list.current?.querySelector('.pal-item.selected')?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const run = (item: Item | undefined): void => {
    if (!item) return
    void api.invoke('palette:run', item.cmd, item.arg)
    api.invoke('overlay:hide')
  }

  let lastGroup = ''
  return (
    <div className="panel palette" ref={panel}>
      <div className="pal-input">
        <Search size={18} />
        <input
          autoFocus
          value={query}
          placeholder="Search tabs, commands, history…"
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              const n = items.length
              if (n) setSelected((s) => (s + (e.key === 'ArrowDown' ? 1 : -1) + n) % n)
            }
            if (e.key === 'Enter') run(items[selected])
          }}
        />
        <kbd>Esc</kbd>
      </div>
      <div className="pal-list" ref={list}>
        {items.length === 0 && <div className="pal-empty">Nothing found.</div>}
        {items.map((item, i) => {
          const header = !query.trim() && item.group !== lastGroup ? item.group : null
          lastGroup = item.group
          return (
            <div key={item.key}>
              {header && <div className="pal-group">{header}</div>}
              <div
                className={`pal-item${i === selected ? ' selected' : ''}`}
                onMouseMove={() => i !== selected && setSelected(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  run(item)
                }}
              >
                <span className="pal-icon">{item.icon}</span>
                <span className="pal-title">{item.title}</span>
                {item.detail && <span className="pal-detail">{item.detail}</span>}
                {item.shortcut && <kbd>{item.shortcut}</kbd>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
