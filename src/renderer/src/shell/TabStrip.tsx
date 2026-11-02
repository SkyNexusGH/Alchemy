import { Moon, Plus, Volume2, VolumeX, X } from '../lib/icons'
import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { TabState } from '@shared/types'
import { api } from '../lib/api'
import { Favicon } from '../lib/ui'
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
    void api.invoke('tabcard:show', { x: r.left - 10, y: r.bottom - 2, width: 300, height: 220 }, id)
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

export function TabStrip(): React.JSX.Element {
  const tabs = useShell((s) => s.win.tabs)
  const activeId = useShell((s) => s.win.activeId)
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
      const left = el.offsetLeft
      next.set(id, left)
      const prev = lastLeft.current.get(id)
      if (prev === undefined || prev === left || id === drag.current?.id) continue
      el.animate([{ transform: `translateX(${prev - left}px)` }, { transform: 'translateX(0)' }], {
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
    const natural = container.left + el.offsetLeft - scroller.current!.scrollLeft
    el.style.transform = `translateX(${d.x - d.grab - natural}px)`
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
    drag.current = { id: tab.id, startX: e.clientX, grab: e.clientX - rect.left, x: e.clientX, started: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>, tab: TabState): void {
    const d = drag.current
    if (!d || d.id !== tab.id) return
    d.x = e.clientX
    if (!d.started) {
      if (Math.abs(e.clientX - d.startX) < 5) return
      d.started = true
      setDragId(d.id)
    }
    placeDragged()

    // Where would the dragged tab's center land among its group (pinned or not)?
    const el = els.current.get(tab.id)!
    const center = e.clientX - d.grab + el.offsetWidth / 2
    const group = tabs.filter((t) => t.pinned === tab.pinned && t.id !== tab.id)
    const groupStart = tab.pinned ? 0 : tabs.filter((t) => t.pinned).length
    let slot = 0
    for (const t of group) {
      const r = els.current.get(t.id)?.getBoundingClientRect()
      if (r && r.left + r.width / 2 < center) slot++
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
      el.animate([{ transform: from }, { transform: 'translateX(0)' }], { duration: 160, easing: 'ease-out' })
    }
    setDragId(null)
  }

  return (
    <div
      className="tabstrip"
      ref={scroller}
      onWheel={(e) => {
        if (scroller.current) scroller.current.scrollLeft += e.deltaY + e.deltaX
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
      onAuxClick={(e) => e.button === 1 && api.invoke('tab:close', tab.id)}
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
          {tab.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
        </button>
      )}
      {!tab.pinned && (
        <button className="tab-close" title="Close tab (Ctrl+W)" onClick={() => api.invoke('tab:close', tab.id)}>
          <X size={13} strokeWidth={2.4} />
        </button>
      )}
    </div>
  )
})
