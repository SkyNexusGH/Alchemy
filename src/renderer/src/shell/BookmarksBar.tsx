import { Folder, WorkspaceIcon } from '../lib/icons'
import type { Bookmark } from '@shared/types'
import { api } from '../lib/api'
import { useSettings } from '../lib/settings'
import { Favicon } from '../lib/ui'
import { useShell } from './store'

/** Bookmark hover cards: open after a short pause, follow the pointer along the bar. */
const card = (() => {
  let timer = 0
  let open = false
  const show = (b: Bookmark, el: HTMLElement): void => {
    const r = el.getBoundingClientRect()
    open = true
    void api.invoke(
      'bmcard:show',
      { x: r.left - 10, y: r.bottom - 2, width: 300, height: 220 },
      { kind: 'bmcard', url: b.url ?? '', title: b.title, favicon: b.favicon ?? null }
    )
  }
  return {
    enter(b: Bookmark, el: HTMLElement): void {
      window.clearTimeout(timer)
      if (open) show(b, el)
      else timer = window.setTimeout(() => show(b, el), 600)
    },
    leave(): void {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        if (open) void api.invoke('bmcard:hide')
        open = false
      }, 120)
    },
    hide(): void {
      window.clearTimeout(timer)
      if (open) void api.invoke('bmcard:hide')
      open = false
    }
  }
})()

export function BookmarksBar(): React.JSX.Element {
  const bookmarks = useShell((s) => s.bookmarks)
  const style = useSettings((s) => s.settings?.appearance.bookmarkStyle ?? 'classic')
  const items = bookmarks.filter((b) => b.parentId === 'bar')
  // Icons only and Dock show just the site icons; names appear in the hover card.
  const iconsOnly = style === 'icons' || style === 'dock'

  return (
    <div className={`bookmarks-bar bm-style-${style}`}>
      {items.map((b) =>
        b.type === 'folder' ? (
          <button
            key={b.id}
            className="bm bm-folder"
            title={b.title || 'Folder'}
            onClick={(e) => {
              card.hide()
              const r = e.currentTarget.getBoundingClientRect()
              api.invoke('menu:bookmarkFolder', b.id, r.left, r.bottom + 2)
            }}
          >
            {b.icon ? <WorkspaceIcon id={b.icon} size={14} /> : <Folder size={14} />}
            {!iconsOnly && <span>{b.title || 'Folder'}</span>}
            {/* Folders look like a small stack of cards, with how many are inside. */}
            <b className="bm-count">{bookmarks.filter((x) => x.parentId === b.id).length}</b>
          </button>
        ) : (
          <button
            key={b.id}
            className="bm"
            onPointerEnter={(e) => card.enter(b, e.currentTarget)}
            onPointerLeave={card.leave}
            onClick={(e) => {
              card.hide()
              api.invoke('tab:navigate', b.url, { newTab: e.ctrlKey, background: e.ctrlKey })
            }}
            onAuxClick={(e) => e.button === 1 && api.invoke('tab:navigate', b.url, { newTab: true, background: true })}
            onMouseDown={(e) => e.button === 1 && e.preventDefault()}
          >
            <Favicon src={b.favicon} url={b.url} size={iconsOnly ? 16 : 14} />
            {!iconsOnly && b.title && <span>{b.title}</span>}
          </button>
        )
      )}
    </div>
  )
}
