import './shell.css'
import { Onion, VenetianMask } from '../lib/icons'
import { Fragment, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { backgroundUrl, useSettings } from '../lib/settings'
import { BrandLogo, Logo } from '../lib/ui'
import { BookmarksBar } from './BookmarksBar'
import { FindBar } from './FindBar'
import { useReportRect } from './layout'
import { DevtoolsPane, SidePanel } from './SidePanel'
import { SideRail } from './SideRail'
import { useShell } from './store'
import { TabStrip } from './TabStrip'
import { Toasts } from './Toasts'
import { BookmarksPanel, useBookmarksPanel } from './BookmarksPanel'
import { forgetAiModels, forgetSmartModel } from '../lib/ai'
import { forgetVoiceModel } from '../lib/voice'
import { AskPanel, useAskPanel } from './AskPanel'
import { Toolbar } from './Toolbar'

export default function Shell(): React.JSX.Element {
  // The bookmarks bar only appears once there's something on it.
  const barEnabled = useSettings((s) => s.settings?.showBookmarksBar ?? false)
  const barHasItems = useShell((s) => s.bookmarks.some((b) => b.parentId === 'bar'))
  const showBar = barEnabled && barHasItems
  const devtools = useShell((s) => s.win.devtools)
  const findOpen = useShell((s) => s.win.find.open)
  const maximized = useShell((s) => s.win.maximized)
  const isPrivate = useShell((s) => s.win.private)
  const isTor = useShell((s) => s.win.tor)
  const panelOpen = useShell((s) => s.win.panelId !== null)
  // The split frames only matter while one of the split tabs is the one on screen.
  const split = useShell((s) => (s.win.split?.includes(s.win.activeId ?? -1) ? s.win.split : null))
  const splitVertical = useShell((s) => s.win.splitVertical)
  const activeId = useShell((s) => s.win.activeId)
  const floating = useShell((s) => s.win.tabs.find((t) => t.id === s.win.activeId)?.floating ?? false)
  const content = useRef<HTMLDivElement>(null)
  useReportRect(content, 'layout:content')
  const sidebar = useSettings((s) => s.settings?.sidebar ?? 'shown')
  const bookmarksPanel = useBookmarksPanel((s) => s.open)
  const askPanel = useAskPanel((s) => s.open)
  // AI features stay off in Masked Mode and Alchemy Tor.
  const askOn = useSettings((s) => s.settings?.lab?.ask === true) && !isPrivate
  // Switched off in the Lab: it's gone, and stays closed if it's switched back on.
  useEffect(() => {
    if (!askOn && useAskPanel.getState().open) useAskPanel.getState().toggle()
  }, [askOn])
  useEffect(() => api.on('ask:toggle', () => useAskPanel.getState().toggle()), [])
  useEffect(() => api.on('ai:models-removed', (which: 'ai' | 'smart' | 'voice') => (which === 'ai' ? forgetAiModels() : which === 'smart' ? forgetSmartModel() : forgetVoiceModel())), [])
  const side = useSettings((s) => s.settings?.sidebarSide ?? 'left')
  const vertical = useSettings((s) => s.settings?.tabLayout === 'vertical')
  const settingsAll = useSettings((s) => s.settings)
  const glass = !isPrivate && settingsAll?.appearance.material === 'glass'
  const wall = glass && settingsAll ? backgroundUrl(settingsAll) : null
  // Site-tinted toolbar: the active page's own colour, mixed into the toolbar.
  const siteColor = useShell((s) => s.win.tabs.find((t) => t.id === s.win.activeId)?.themeColor ?? null)
  const tint = !isPrivate && settingsAll?.appearance.siteTint ? siteColor : null
  // Hidden Sidebar: out while the mouse is on it, tucked away again shortly after it leaves.
  const [peek, setPeek] = useState(false)
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => setPeek(false), [sidebar])
  const railHover = {
    onMouseEnter: () => {
      clearTimeout(leaveTimer.current)
      setPeek(true)
    },
    onMouseLeave: () => {
      clearTimeout(leaveTimer.current)
      leaveTimer.current = setTimeout(() => setPeek(false), 350)
    }
  }

  return (
    <div
      className={`shell${maximized ? ' maximized' : ''}${isPrivate ? ' private' : ''} sidebar-${sidebar}${peek ? ' peek' : ''}${side === 'right' ? ' sidebar-right' : ''}${vertical ? ' tabs-vertical' : ''}${tint ? ' site-tint' : ''}`}
      style={{ ...(tint ? { '--site': tint } : {}), ...(wall ? { '--wall': `url("${wall}")` } : {}) } as React.CSSProperties}
    >
      <header className="titlebar">
        <button
          className="brand"
          title="Alchemy menu"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            api.invoke('menu:app', r.left + 6, r.bottom + 2)
          }}
        >
          <BrandLogo size={27} />
        </button>
        {isPrivate && (
          <span
            className="private-badge"
            title={
              isTor
                ? 'Alchemy Tor: this window goes through the Tor network, and nothing is saved after you close it'
                : 'Masked Mode: nothing is saved after you close all Masked Mode windows'
            }
          >
            {isTor ? <Onion size={14} /> : <VenetianMask size={14} />}
            {isTor ? 'Alchemy Tor' : 'Masked Mode'}
          </span>
        )}
        {!vertical && <TabStrip />}
        <div className="titlebar-drag" />
        <Toasts />
      </header>
      {sidebar !== 'off' && <SideRail {...(sidebar === 'hidden' ? railHover : {})} />}
      {vertical && (
        <aside className="vtabs">
          <TabStrip vertical />
        </aside>
      )}
      <main className="main">
        <Toolbar />
        {showBar && <BookmarksBar />}
        {findOpen && <FindBar />}
        <div className="body">
          {bookmarksPanel && <BookmarksPanel />}
          {panelOpen && <SidePanel />}
          <div className={`content${split ? ' split' : ''}${split && splitVertical ? ' vertical' : ''}`} ref={content}>
            {split ? (
              <SplitPanes ids={split} activeId={activeId} />
            ) : floating ? (
              <div className="floating-note">
                <Logo size={44} />
                <b>Playing in the floating window</b>
                <button className="btn" onClick={() => api.invoke('tab:activate', activeId)}>
                  Bring it back
                </button>
              </div>
            ) : (
              <Logo size={44} />
            )}
          </div>
          {devtools && <DevtoolsPane />}
          {askPanel && askOn && !isPrivate && <AskPanel />}
        </div>
      </main>
    </div>
  )
}

/**
 * The frames behind split view's pages. Two pages share the space by the ratio you drag the
 * line between them to (pages themselves are drawn by the main process in the same places).
 */
function SplitPanes({ ids, activeId }: { ids: number[]; activeId: number | null }): React.JSX.Element {
  const ratio = useShell((s) => s.win.splitRatio)
  const vertical = useShell((s) => s.win.splitVertical)
  const two = ids.length === 2
  const drag = (e: React.PointerEvent<HTMLDivElement>): void => {
    const box = e.currentTarget.parentElement!.getBoundingClientRect()
    e.currentTarget.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent): void => {
      const r = vertical ? (ev.clientY - box.top) / box.height : (ev.clientX - box.left) / box.width
      void api.invoke('split:ratio', r)
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  return (
    <>
      {ids.map((id, i) => (
        <Fragment key={id}>
          {i > 0 && (
            <div
              className="split-handle"
              title="Drag to resize · double-click to even them out · right-click a tab to swap sides"
              onPointerDown={two ? drag : undefined}
              onDoubleClick={() => two && void api.invoke('split:ratio', 0.5)}
            />
          )}
          <div className={`split-pane${id === activeId ? ' focused' : ''}`} style={{ flex: two ? (i === 0 ? ratio : 1 - ratio) : 1 }} />
        </Fragment>
      ))}
    </>
  )
}
