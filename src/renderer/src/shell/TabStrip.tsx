import { Moon, Plus, VolumeX, X } from '../lib/icons'
import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { TabState } from '@shared/types'
import { api } from '../lib/api'
import { Favicon } from '../lib/ui'
import { useSettings } from '../lib/settings'
import { useShell } from './store'

/**
 * The tab hover card (title, site, memory, volume boost) lives in the overlay above pages.
 * It opens after a short hover, moves along instantly while it's open, and stays open while
 * the pointer is on the card itself.
 */
const hoverCard = (() => {
  let showTimer = 0
  let hideTimer = 0
  let open = false
  let overCard = false
  const show = (id: number, el: HTMLElement): void => {
    const r = el.getBoundingClientRect()
    open = true
    // Vertical tabs: the card opens beside the tab instead of under it.
    const side = el.closest('.tabstrip.vertical')
    const at = side ? { x: r.right - 6, y: r.top - 16 } : { x: r.left - 10, y: r.bottom - 2 }
    void api.invoke('tabcard:show', { ...at, width: 300, height: 220 }, id)
  }
  api.on('tabcard:hover', (over: boolean) => {
    overCard = over
    window.clearTimeout(hideTimer)
    if (!over) hideTimer = window.setTimeout(hide, 220)
  })
  function hide(): void {
    window.clearTimeout(showTimer)
    window.clearTimeout(hideTimer)
    if (open) void api.invoke('tabcard:hide')
    open = false
    overCard = false
  }
  return {
    enter(id: number, el: HTMLElement): void {
      window.clearTimeout(showTimer)
      window.clearTimeout(hideTimer)
      if (open) show(id, el)
      else showTimer = window.setTimeout(() => show(id, el), 550)
    },
    leave(): void {
      window.clearTimeout(showTimer)
      if (open && !overCard) hideTimer = window.setTimeout(hide, 220)
    },
    hide
  }
})()

/** The tabs: across the title bar, or down the side when `vertical` (Settings → Tabs & sidebar). */
export function TabStrip({ vertical = false }: { vertical?: boolean }): React.JSX.Element {
  // Drag and slide along whichever way the tabs run.
  const T = vertical ? 'translateY' : 'translateX'
  const pos = (e: { clientX: number; clientY: number }): number => (vertical ? e.clientY : e.clientX)
  const offset = (el: HTMLElement): number => (vertical ? el.offsetTop : el.offsetLeft)
  const size = (el: HTMLElement): number => (vertical ? el.offsetHeight : el.offsetWidth)
  // Tabs that appear after the strip first draws pop in; the ones there at startup don't.
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 700)
    return () => clearTimeout(t)
  }, [])
  const tabs = useShell((s) => s.win.tabs)
  const activeId = useShell((s) => s.win.activeId)
  // Switching workspace slides the new set of tabs in from the side it's on.
  const workspaceId = useShell((s) => s.win.workspaceId)
  // Select the stored array itself (a stable reference), then map it here.
  const workspaces = useSettings((s) => s.settings?.workspaces)
  const order = (workspaces ?? []).map((w) => w.id)
  const lastWs = useRef(workspaceId)
  const [slide, setSlide] = useState('')
  useEffect(() => {
    const from = order.indexOf(lastWs.current)
    lastWs.current = workspaceId
    if (from === -1) return
    setSlide(order.indexOf(workspaceId) > from ? 'ws-in-right' : 'ws-in-left')
    const t = setTimeout(() => setSlide(''), 360)
    return () => clearTimeout(t)
  }, [workspaceId])
  const islandList = useShell((s) => s.win.islands)
  const islands = useMemo(() => new Map(islandList.map((i) => [i.id, i])), [islandList])
  const scroller = useRef<HTMLDivElement>(null)
  const els = useRef(new Map<number, HTMLDivElement>())
  const [dragId, setDragId] = useState<number | null>(null)
  // Opera-style multi-select: Ctrl+click picks tabs, Shift+click picks a range.
  const [selected, setSelected] = useState<number[]>([])
  const live = selected.filter((id) => tabs.some((t) => t.id === id))
  useEffect(() => api.on('tabs:clear-selection', () => setSelected([])), [])
  const drag = useRef<{ id: number; startX: number; grab: number; x: number; started: boolean } | null>(null)

  // FLIP: when tabs open, close or reorder, slide the others to their new place.
  const lastLeft = useRef(new Map<number, number>())
  useLayoutEffect(() => {
    const next = new Map<number, number>()
    for (const [id, el] of els.current) {
      const left = offset(el)
      next.set(id, left)
      const prev = lastLeft.current.get(id)
      if (prev === undefined || prev === left || id === drag.current?.id) continue
      el.animate([{ transform: `${T}(${prev - left}px)` }, { transform: `${T}(0)` }], {
        duration: 180,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)'
      })
    }
    lastLeft.current = next
    placeDragged()
  })

  function placeDragged(): void {
    const d = drag.current
    const el = d && els.current.get(d.id)
    if (!d?.started || !el) return
    const container = scroller.current!.getBoundingClientRect()
    const natural = vertical
      ? container.top + el.offsetTop - scroller.current!.scrollTop
      : container.left + el.offsetLeft - scroller.current!.scrollLeft
    el.style.transform = `${T}(${d.x - d.grab - natural}px)`
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>, tab: TabState): void {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return
    if (e.ctrlKey || e.metaKey) {
      const base = live.length ? live : activeId !== null ? [activeId] : []
      setSelected(base.includes(tab.id) ? base.filter((id) => id !== tab.id) : [...base, tab.id])
      return
    }
    if (e.shiftKey && activeId !== null) {
      const ids = tabs.map((t) => t.id)
      const [a, b] = [ids.indexOf(activeId), ids.indexOf(tab.id)].sort((x, y) => x - y)
      setSelected(ids.slice(a, b + 1))
      return
    }
    if (live.length) setSelected([])
    if (tab.id !== activeId) api.invoke('tab:activate', tab.id)
    const rect = e.currentTarget.getBoundingClientRect()
    drag.current = { id: tab.id, startX: pos(e), grab: pos(e) - (vertical ? rect.top : rect.left), x: pos(e), started: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>, tab: TabState): void {
    const d = drag.current
    if (!d || d.id !== tab.id) return
    d.x = pos(e)
    if (!d.started) {
      if (Math.abs(pos(e) - d.startX) < 5) return
      d.started = true
      setDragId(d.id)
    }
    placeDragged()

    // Where would the dragged tab's center land among its group (pinned or not)?
    const el = els.current.get(tab.id)!
    const center = pos(e) - d.grab + size(el) / 2
    const group = tabs.filter((t) => t.pinned === tab.pinned && t.id !== tab.id)
    const groupStart = tab.pinned ? 0 : tabs.filter((t) => t.pinned).length
    let slot = 0
    for (const t of group) {
      const r = els.current.get(t.id)?.getBoundingClientRect()
      if (r && (vertical ? r.top + r.height / 2 : r.left + r.width / 2) < center) slot++
    }
    const target = groupStart + slot
    if (target !== tabs.findIndex((t) => t.id === tab.id)) api.invoke('tab:move', tab.id, target)
  }

  function onPointerUp(tab: TabState): void {
    const d = drag.current
    if (!d || d.id !== tab.id) return
    drag.current = null
    const el = els.current.get(tab.id)
    if (el && d.started) {
      const from = el.style.transform
      el.style.transform = ''
      el.animate([{ transform: from }, { transform: `${T}(0)` }], { duration: 160, easing: 'ease-out' })
    }
    setDragId(null)
  }

  return (
    <div
      className={`tabstrip${vertical ? ' vertical' : ''}${ready ? ' ready' : ''} ${slide}`}
      ref={scroller}
      onWheel={(e) => {
        // Across the top, the wheel scrolls sideways; down the side it scrolls normally.
        if (!vertical && scroller.current) scroller.current.scrollLeft += e.deltaY + e.deltaX
      }}
      onDoubleClick={(e) => e.target === e.currentTarget && e.preventDefault()}
    >
      {tabs.map((tab, i) => {
        const island = tab.islandId !== null ? islands.get(tab.islandId) : undefined
        const startsIsland = island && tabs[i - 1]?.islandId !== tab.islandId
        const endsIsland = island && tabs[i + 1]?.islandId !== tab.islandId
        // A collapsed island shows only its handle (plus the active tab, if it's inside).
        const hidden = island?.collapsed && tab.id !== activeId
        return (
          <Fragment key={tab.id}>
            {startsIsland && (
              <IslandHandle
                color={island.color}
                collapsed={island.collapsed}
                count={tabs.filter((t) => t.islandId === tab.islandId).length}
                onClick={() => api.invoke('island:toggle', tab.islandId)}
                onMenu={(x, y) => api.invoke('island:menu', tab.islandId, x, y)}
              />
            )}
            {!hidden && (
              <Tab
                tab={tab}
                active={tab.id === activeId}
                dragging={tab.id === dragId}
                selected={live.length > 1 && live.includes(tab.id)}
                selection={live}
                island={island ? { color: island.color, end: !!endsIsland } : null}
                ref={(el) => {
                  if (el) els.current.set(tab.id, el)
                  else els.current.delete(tab.id)
                }}
                onPointerDown={(e) => onPointerDown(e, tab)}
                onPointerMove={(e) => onPointerMove(e, tab)}
                onPointerUp={() => onPointerUp(tab)}
              />
            )}
          </Fragment>
        )
      })}
      <button className="icon-btn new-tab" title="New tab (Ctrl+T)" onClick={() => api.invoke('tab:new')}>
        <Plus size={17} />
      </button>
    </div>
  )
}

function IslandHandle({
  color,
  collapsed,
  count,
  onClick,
  onMenu
}: {
  color: string
  collapsed: boolean
  count: number
  onClick: () => void
  onMenu: (x: number, y: number) => void
}): React.JSX.Element {
  return (
    <button
      className={`island-handle${collapsed ? ' collapsed' : ''}`}
      style={{ '--ic': color } as React.CSSProperties}
      title={collapsed ? `Expand group (${count} tabs)` : 'Collapse group (right-click for more)'}
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault()
        onMenu(e.clientX, e.clientY)
      }}
    >
      <span className="island-dot" />
      {collapsed && <span className="island-count">{count}</span>}
    </button>
  )
}

interface TabProps {
  tab: TabState
  active: boolean
  dragging: boolean
  selected: boolean
  selection: number[]
  island: { color: string; end: boolean } | null
  ref: React.Ref<HTMLDivElement>
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerUp: () => void
}

/** Folds the tab away, then closes it. */
function closeTab(from: HTMLElement, id: number): void {
  const el = from.closest<HTMLElement>('.tab')
  if (!el || el.classList.contains('closing') || document.documentElement.dataset.motion === 'reduced') {
    void api.invoke('tab:close', id)
    return
  }
  el.classList.add('closing')
  setTimeout(() => void api.invoke('tab:close', id), 150)
}

const Tab = memo(function Tab({ tab, active, dragging, selected, selection, island, ref, ...handlers }: TabProps): React.JSX.Element {
  const cls = [
    'tab',
    active && 'active',
    tab.pinned && 'pinned',
    tab.sleeping && 'sleeping',
    dragging && 'dragging',
    selected && 'selected',
    island && 'in-island',
    island?.end && 'island-end'
  ]
  return (
    <div
      ref={ref}
      onPointerEnter={(e) => hoverCard.enter(tab.id, e.currentTarget)}
      onPointerLeave={() => hoverCard.leave()}
      className={cls.filter(Boolean).join(' ')}
      style={island ? ({ '--ic': island.color } as React.CSSProperties) : undefined}
      onAuxClick={(e) => e.button === 1 && closeTab(e.currentTarget, tab.id)}
      onMouseDown={(e) => e.button === 1 && e.preventDefault()}
      onContextMenu={(e) => {
        e.preventDefault()
        api.invoke('tab:menu', tab.id, e.clientX, e.clientY, selection)
      }}
      onPointerCancel={handlers.onPointerUp}
      {...handlers}
      onPointerDown={(e) => {
        hoverCard.hide()
        handlers.onPointerDown(e)
      }}
    >
      <span className="tab-icon">
        {tab.loading ? <span className="spinner" /> : <Favicon src={tab.favicon} url={tab.displayUrl} size={16} />}
        {tab.sleeping && !tab.pinned && (
          <span className="sleep-badge">
            <Moon size={8} strokeWidth={3} />
          </span>
        )}
      </span>
      {!tab.pinned && <span className="tab-title">{tab.title}</span>}
      {(tab.audible || tab.muted) && (
        <button
          className="tab-audio"
          title={tab.muted ? 'Unmute tab' : 'Mute tab'}
          onClick={() => api.invoke('tab:mute', tab.id)}
        >
          {tab.muted ? (
            <VolumeX size={13} />
          ) : (
            // A playing tab shows live sound bars instead of a speaker.
            <span className="sound-bars" aria-label="Playing sound">
              <i />
              <i />
              <i />
              <i />
            </span>
          )}
        </button>
      )}
      {!tab.pinned && (
        <button className="tab-close" title="Close tab (Ctrl+W)" onClick={(e) => closeTab(e.currentTarget, tab.id)}>
          <X size={13} strokeWidth={2.4} />
        </button>
      )}
    </div>
  )
})
