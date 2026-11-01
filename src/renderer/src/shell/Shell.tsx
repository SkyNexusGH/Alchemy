import './shell.css'
import { VenetianMask } from '../lib/icons'
import { useRef } from 'react'
import { api } from '../lib/api'
import { useSettings } from '../lib/settings'
import { Logo } from '../lib/ui'
import { BookmarksBar } from './BookmarksBar'
import { FindBar } from './FindBar'
import { useReportRect } from './layout'
import { DevtoolsPane, SidePanel } from './SidePanel'
import { SideRail } from './SideRail'
import { useShell } from './store'
import { TabStrip } from './TabStrip'
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
  const panelOpen = useShell((s) => s.win.panelId !== null)
  // The split frames only matter while one of the split tabs is the one on screen.
  const split = useShell((s) => (s.win.split?.includes(s.win.activeId ?? -1) ? s.win.split : null))
  const activeId = useShell((s) => s.win.activeId)
  const content = useRef<HTMLDivElement>(null)
  useReportRect(content, 'layout:content')

  return (
    <div className={`shell${maximized ? ' maximized' : ''}${isPrivate ? ' private' : ''}`}>
      <header className="titlebar">
        <button
          className="brand"
          title="Ovyra menu"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            api.invoke('menu:app', r.left, r.bottom + 4)
          }}
        >
          <Logo size={21} />
        </button>
        {isPrivate && (
          <span className="private-badge" title="Private window: nothing is saved after you close all private windows">
            <VenetianMask size={14} />
            Private
          </span>
        )}
        <TabStrip />
        <div className="titlebar-drag" />
      </header>
      <SideRail />
      <main className="main">
        <Toolbar />
        {showBar && <BookmarksBar />}
        {findOpen && <FindBar />}
        <div className="body">
          {panelOpen && <SidePanel />}
          <div className={`content${split ? ' split' : ''}`} ref={content}>
            {split ? (
              split.map((id) => <div key={id} className={`split-pane${id === activeId ? ' focused' : ''}`} />)
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
