import './shell.css'
import { Onion, VenetianMask } from '../lib/icons'
import { useEffect, useRef, useState } from 'react'
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
  const activeId = useShell((s) => s.win.activeId)
  const floating = useShell((s) => s.win.tabs.find((t) => t.id === s.win.activeId)?.floating ?? false)
  const content = useRef<HTMLDivElement>(null)
  useReportRect(content, 'layout:content')
  const sidebar = useSettings((s) => s.settings?.sidebar ?? 'shown')
  const bookmarksPanel = useBookmarksPanel((s) => s.open)
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
          <div className={`content${split ? ' split' : ''}`} ref={content}>
            {split ? (
              split.map((id) => <div key={id} className={`split-pane${id === activeId ? ' focused' : ''}`} />)
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
        </div>
      </main>
    </div>
  )
}
