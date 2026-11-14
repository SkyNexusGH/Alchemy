import { useEffect, useState } from 'react'
import { create } from 'zustand'
import type { Bookmark, LaterItem } from '@shared/types'
import { api } from '../lib/api'
import { Bookmark as BookmarkIcon, ChevronDown, ChevronRight, Folder, WorkspaceIcon, X } from '../lib/icons'
import { Favicon } from '../lib/ui'
import { useShell } from './store'

/** Whether the bookmarks panel is open beside the page (toggled from the sidebar). */
export const useBookmarksPanel = create<{ open: boolean; tab: 'bookmarks' | 'later'; toggle: () => void; show: (tab: 'bookmarks' | 'later') => void }>((set) => ({
  open: false,
  tab: 'bookmarks',
  toggle: () => set((s) => ({ open: !s.open })),
  show: (tab) => set({ open: true, tab })
}))
api.on('later:show', () => useBookmarksPanel.getState().show('later'))

/** Your bookmarks as a tree beside the page: folders open and close, a click opens the site. */
export function BookmarksPanel(): React.JSX.Element {
  const bookmarks = useShell((s) => s.bookmarks)
  const close = useBookmarksPanel((s) => s.toggle)
  const tab = useBookmarksPanel((s) => s.tab)
  const show = useBookmarksPanel((s) => s.show)
  const roots = bookmarks.filter((b) => b.parentId === 'bar' || b.parentId === 'other')
  return (
    <aside className="side-panel bm-panel">
      <div className="bm-panel-head">
        <BookmarkIcon size={15} />
        <div className="bm-tabs">
          <button className={tab === 'bookmarks' ? 'on' : ''} onClick={() => show('bookmarks')}>
            Bookmarks
          </button>
          <button className={tab === 'later' ? 'on' : ''} onClick={() => show('later')}>
            Later list
          </button>
        </div>
        <span className="spacer" />
        <button className="icon-btn" title="Close" onClick={close}>
          <X size={14} />
        </button>
      </div>
      {tab === 'later' ? (
        <LaterList />
      ) : (
      <div className="bm-tree">
        {roots.length === 0 && <div className="bm-empty">Bookmarks you add with the star show up here.</div>}
        {roots.map((b) => (
          <Node key={b.id} b={b} all={bookmarks} depth={0} />
        ))}
      </div>
      )}
    </aside>
  )
}

/** #1156 Pages saved for later: unread first; opening one marks it read. */
function LaterList(): React.JSX.Element {
  const [items, setItems] = useState<LaterItem[]>([])
  useEffect(() => {
    void api.invoke<LaterItem[]>('later:list').then(setItems)
    return api.on('later', setItems)
  }, [])
  const unread = items.filter((i) => !i.read)
  const read = items.filter((i) => i.read)
  const row = (i: LaterItem): React.JSX.Element => (
    <div key={i.url} className={`later-row${i.read ? ' read' : ''}`}>
      <button className="bm-node" title={i.url} onClick={(e) => void api.invoke('later:open', i.url, e.ctrlKey || e.button === 1)}>
        <Favicon src={i.favicon} url={i.url} size={15} />
        <span>{i.title}</span>
      </button>
      <button className="icon-btn" title={i.read ? 'Mark unread' : 'Mark read'} onClick={() => void api.invoke('later:read', i.url, !i.read)}>
        {i.read ? '↺' : '✓'}
      </button>
      <button className="icon-btn" title="Remove" onClick={() => void api.invoke('later:remove', i.url)}>
        <X size={12} />
      </button>
    </div>
  )
  return (
    <div className="bm-tree">
      {items.length === 0 && <div className="bm-empty">Right-click any page and choose Save to Later list, or use Ctrl+K.</div>}
      {unread.map(row)}
      {read.length > 0 && (
        <>
          <div className="later-head">
            <span>Read</span>
            <button className="w-link" onClick={() => void api.invoke('later:remove')}>
              Clear
            </button>
          </div>
          {read.map(row)}
        </>
      )}
    </div>
  )
}

function Node({ b, all, depth }: { b: Bookmark; all: Bookmark[]; depth: number }): React.JSX.Element {
  const [open, setOpen] = useState(depth === 0)
  const pad = { paddingLeft: 8 + depth * 14 }
  if (b.type === 'folder') {
    const kids = all.filter((x) => x.parentId === b.id)
    return (
      <>
        <button className="bm-node" style={pad} onClick={() => setOpen(!open)}>
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          {b.icon ? <WorkspaceIcon id={b.icon} size={15} /> : <Folder size={15} />}
          <span>{b.title || 'Folder'}</span>
          <em>{kids.length}</em>
        </button>
        {open && kids.map((k) => <Node key={k.id} b={k} all={all} depth={depth + 1} />)}
      </>
    )
  }
  return (
    <button
      className="bm-node"
      style={{ paddingLeft: 8 + depth * 14 + 17 }}
      title={b.url}
      onClick={(e) => api.invoke('tab:navigate', b.url, { newTab: e.ctrlKey, background: e.ctrlKey })}
      onAuxClick={(e) => e.button === 1 && api.invoke('tab:navigate', b.url, { newTab: true, background: true })}
    >
      <Favicon src={b.favicon} url={b.url} size={15} />
      <span>{b.title || b.url}</span>
    </button>
  )
}
