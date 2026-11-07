import { useState } from 'react'
import { create } from 'zustand'
import type { Bookmark } from '@shared/types'
import { api } from '../lib/api'
import { Bookmark as BookmarkIcon, ChevronDown, ChevronRight, Folder, WorkspaceIcon, X } from '../lib/icons'
import { Favicon } from '../lib/ui'
import { useShell } from './store'

/** Whether the bookmarks panel is open beside the page (toggled from the sidebar). */
export const useBookmarksPanel = create<{ open: boolean; toggle: () => void }>((set) => ({
  open: false,
  toggle: () => set((s) => ({ open: !s.open }))
}))

/** Your bookmarks as a tree beside the page: folders open and close, a click opens the site. */
export function BookmarksPanel(): React.JSX.Element {
  const bookmarks = useShell((s) => s.bookmarks)
  const close = useBookmarksPanel((s) => s.toggle)
  const roots = bookmarks.filter((b) => b.parentId === 'bar' || b.parentId === 'other')
  return (
    <aside className="side-panel bm-panel">
      <div className="bm-panel-head">
        <BookmarkIcon size={15} />
        <b>Bookmarks</b>
        <span className="spacer" />
        <button className="icon-btn" title="Close" onClick={close}>
          <X size={14} />
        </button>
      </div>
      <div className="bm-tree">
        {roots.length === 0 && <div className="bm-empty">Bookmarks you add with the star show up here.</div>}
        {roots.map((b) => (
          <Node key={b.id} b={b} all={bookmarks} depth={0} />
        ))}
      </div>
    </aside>
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
