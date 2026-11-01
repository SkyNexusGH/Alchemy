import { Folder } from 'lucide-react'
import { api } from '../lib/api'
import { Favicon } from '../lib/ui'
import { useShell } from './store'

export function BookmarksBar(): React.JSX.Element {
  const bookmarks = useShell((s) => s.bookmarks)
  const items = bookmarks.filter((b) => b.parentId === 'bar')

  return (
    <div className="bookmarks-bar">
      {items.length === 0 && (
        <span className="bar-hint">Bookmark pages with the ☆ in the address bar or Ctrl+D — they show up here.</span>
      )}
      {items.map((b) =>
        b.type === 'folder' ? (
          <button
            key={b.id}
            className="bm"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              api.invoke('menu:bookmarkFolder', b.id, r.left, r.bottom + 2)
            }}
          >
            <Folder size={14} />
            <span>{b.title || 'Folder'}</span>
          </button>
        ) : (
          <button
            key={b.id}
            className="bm"
            title={`${b.title}\n${b.url}`}
            onClick={(e) => api.invoke('tab:navigate', b.url, { newTab: e.ctrlKey, background: e.ctrlKey })}
            onAuxClick={(e) => e.button === 1 && api.invoke('tab:navigate', b.url, { newTab: true, background: true })}
            onMouseDown={(e) => e.button === 1 && e.preventDefault()}
          >
            <Favicon src={b.favicon} url={b.url} size={14} />
            {b.title && <span>{b.title}</span>}
          </button>
        )
      )}
    </div>
  )
}
