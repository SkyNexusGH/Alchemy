import './pages.css'
import { Bookmark as BookmarkIcon, Folder, FolderPlus, Pencil, Plus, Search, Trash2 } from '../lib/icons'
import { useEffect, useMemo, useState } from 'react'
import type { Bookmark } from '@shared/types'
import { toUrl } from '@shared/url'
import { api } from '../lib/api'
import { WorkspaceIconPicker } from '../lib/pickers'
import { Favicon, setPageIcon } from '../lib/ui'

document.title = 'Bookmarks'
setPageIcon('<path d="M6 3h12v18l-6-4-6 4z"/>')

type Editing = { id?: string; type: 'url' | 'folder'; title: string; url: string; parentId: string; icon?: string }

export default function Bookmarks(): React.JSX.Element {
  const [all, setAll] = useState<Bookmark[]>([])
  const [folder, setFolder] = useState('bar')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Editing | null>(null)

  useEffect(() => {
    api.invoke<Bookmark[]>('bookmarks:list').then(setAll)
    return api.on('bookmarks', setAll)
  }, [])

  const folders = useMemo(() => {
    // Depth-first list of folders for the sidebar and the "move to" picker.
    const out: { b: Bookmark; depth: number }[] = []
    const walk = (parentId: string | null, depth: number): void => {
      for (const b of all) if (b.type === 'folder' && b.parentId === parentId) {
        out.push({ b, depth })
        walk(b.id, depth + 1)
      }
    }
    walk(null, 0)
    return out
  }, [all])

  const q = query.trim().toLowerCase()
  const items = q
    ? all.filter((b) => b.type === 'url' && `${b.title} ${b.url}`.toLowerCase().includes(q))
    : all.filter((b) => b.parentId === folder)
  const current = all.find((b) => b.id === folder)

  return (
    <div className="page" style={{ maxWidth: 1080 }}>
      <div className="page-head">
        <span className="page-icon">
          <BookmarkIcon size={22} />
        </span>
        <h1>Bookmarks</h1>
        <span className="spacer" />
        <label className="search-field">
          <Search size={15} />
          <input className="field" placeholder="Search bookmarks" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 20, alignItems: 'start' }}>
        <nav className="card" style={{ padding: 6 }}>
          {folders.map(({ b, depth }) => (
            <button
              key={b.id}
              className="row"
              style={{
                width: '100%',
                paddingLeft: 14 + depth * 16,
                background: !q && folder === b.id ? 'var(--accent-soft)' : undefined
              }}
              onClick={() => {
                setQuery('')
                setFolder(b.id)
              }}
            >
              <Folder size={16} style={{ flexShrink: 0, color: 'var(--text-2)' }} />
              <span className="title">{b.title}</span>
            </button>
          ))}
        </nav>

        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
            <div style={{ fontWeight: 650, fontSize: 15, flex: 1 }}>{q ? 'Search results' : current?.title}</div>
            {!q && (
              <>
                <button className="btn small" onClick={() => setEditing({ type: 'url', title: '', url: '', parentId: folder })}>
                  <Plus size={14} /> Add bookmark
                </button>
                <button className="btn small" onClick={() => setEditing({ type: 'folder', title: '', url: '', parentId: folder })}>
                  <FolderPlus size={14} /> New folder
                </button>
              </>
            )}
          </div>
          <div className="card" style={{ padding: 6 }}>
            {items.length === 0 && (
              <div className="empty" style={{ padding: 40 }}>
                {q ? 'No bookmarks match.' : 'This folder is empty.'}
              </div>
            )}
            {items.map((b) => (
              <div key={b.id} className="row" onDoubleClick={() => b.type === 'folder' && setFolder(b.id)}>
                {b.type === 'folder' ? (
                  <Folder size={16} style={{ flexShrink: 0, color: 'var(--text-2)' }} />
                ) : (
                  <Favicon src={b.favicon} url={b.url} size={16} />
                )}
                {b.type === 'folder' ? (
                  <button className="title" style={{ textAlign: 'left' }} onClick={() => setFolder(b.id)}>
                    {b.title || 'Folder'}
                  </button>
                ) : (
                  <a className="title" href={b.url}>
                    {b.title || b.url}
                  </a>
                )}
                <span className="sub">{b.url}</span>
                <span className="actions">
                  <button
                    className="icon-btn"
                    title="Edit"
                    onClick={() => setEditing({ id: b.id, type: b.type, title: b.title, url: b.url ?? '', parentId: b.parentId!, icon: b.icon ?? '' })}
                  >
                    <Pencil size={14} />
                  </button>
                  <button className="icon-btn" title="Delete" onClick={() => api.invoke('bookmarks:remove', b.id)}>
                    <Trash2 size={14} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {editing && <EditDialog editing={editing} folders={folders} onClose={() => setEditing(null)} />}
    </div>
  )
}

function EditDialog({
  editing,
  folders,
  onClose
}: {
  editing: Editing
  folders: { b: Bookmark; depth: number }[]
  onClose: () => void
}): React.JSX.Element {
  const [e, setE] = useState(editing)
  const url = e.type === 'url' ? toUrl(e.url) : null
  const valid = e.type === 'folder' ? !!e.title.trim() : !!url

  const save = async (): Promise<void> => {
    if (!valid) return
    if (e.id) {
      await api.invoke('bookmarks:update', e.id, {
        title: e.title.trim(),
        ...(e.type === 'url' ? { url } : { icon: e.icon ?? '' }),
        ...(e.parentId !== editing.parentId ? { parentId: e.parentId } : {})
      })
    } else {
      await api.invoke('bookmarks:add', {
        type: e.type,
        title: e.title.trim() || url,
        url: url ?? undefined,
        parentId: e.parentId
      })
    }
    onClose()
  }

  return (
    <div className="modal-backdrop" onMouseDown={(ev) => ev.target === ev.currentTarget && onClose()}>
      <form
        className="modal"
        onSubmit={(ev) => {
          ev.preventDefault()
          save()
        }}
      >
        <h2>{e.id ? 'Edit' : 'New'} {e.type === 'folder' ? 'folder' : 'bookmark'}</h2>
        <p />
        <div className="stack">
          <input className="field" autoFocus placeholder="Name" value={e.title} onChange={(ev) => setE({ ...e, title: ev.target.value })} />
          {e.type === 'url' && (
            <input className="field" placeholder="Address" value={e.url} onChange={(ev) => setE({ ...e, url: ev.target.value })} />
          )}
          {e.type === 'folder' && e.id && (
            <WorkspaceIconPicker value={e.icon ?? ''} name={e.title || 'F'} onChange={(icon) => setE({ ...e, icon })} />
          )}
          <select className="field" value={e.parentId} onChange={(ev) => setE({ ...e, parentId: ev.target.value })}>
            {folders
              .filter(({ b }) => b.id !== e.id)
              .map(({ b, depth }) => (
                <option key={b.id} value={b.id}>
                  {'  '.repeat(depth)}
                  {b.title}
                </option>
              ))}
          </select>
        </div>
        <div className="buttons">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!valid}>
            Save
          </button>
        </div>
      </form>
    </div>
  )
}
