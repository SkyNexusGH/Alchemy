import './newtab.css'
import { Plus, Search, VenetianMask, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { SEARCH_ENGINES, type SpeedDialItem } from '@shared/types'
import { hostOf, toUrl } from '@shared/url'
import { api } from '../lib/api'
import { saveSettings, useSettings } from '../lib/settings'
import { Favicon, Logo, setPageIcon, siteGradient } from '../lib/ui'

document.title = 'New Tab'
setPageIcon('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>')

export default function NewTab(): React.JSX.Element {
  const settings = useSettings((s) => s.settings)
  const dial = settings?.speedDial ?? []
  const [icons, setIcons] = useState<Record<string, string | null>>({})
  const [adding, setAdding] = useState(false)
  const [isPrivate, setPrivate] = useState(false)
  const now = useClock()

  useEffect(() => {
    api.invoke<{ private: boolean }>('page:context').then((c) => {
      setPrivate(c.private)
      if (c.private) document.title = 'Private Tab'
    })
  }, [])

  useEffect(() => {
    if (dial.length) api.invoke('history:favicons', dial.map((d) => d.url)).then(setIcons)
  }, [dial.map((d) => d.url).join()])

  const remove = (id: string): void => void saveSettings({ speedDial: dial.filter((d) => d.id !== id) })
  const engine = SEARCH_ENGINES[settings?.searchEngine ?? 'google'].name

  return (
    <div className={`ntp${isPrivate ? ' private' : ''}`}>
      <div className="blobs" aria-hidden>
        <span className="blob b1" />
        <span className="blob b2" />
        <span className="blob b3" />
      </div>

      <div className="ntp-center">
        <div className="clock">
          {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
        <div className="date">{now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</div>

        {/* Hands off to the real address bar so suggestions work the same everywhere. */}
        <button className="fakebox" onClick={() => api.invoke('omnibox:focus')}>
          <Search size={18} />
          <span>Search {engine} or type a URL</span>
          <Logo size={20} />
        </button>

        {isPrivate && (
          <div className="private-card">
            <VenetianMask size={22} />
            <div>
              <b>You're browsing privately</b>
              <p>
                Ovyra won't keep your history, cookies, site data or form entries once you close all private windows.
                Downloads and bookmarks you make are kept. Sites, your employer or your internet provider can still see
                what you visit.
              </p>
            </div>
          </div>
        )}

        <div className="dial">
          {dial.map((d) => (
            <a key={d.id} className="tile" href={d.url} style={{ background: siteGradient(hostOf(d.url)) }}>
              <span className="tile-icon">
                <Favicon src={icons[d.url]} url={d.url} size={30} />
              </span>
              <span className="tile-title">{d.title || hostOf(d.url)}</span>
              <button
                className="tile-remove"
                title="Remove"
                onClick={(e) => {
                  e.preventDefault()
                  remove(d.id)
                }}
              >
                <X size={12} strokeWidth={3} />
              </button>
            </a>
          ))}
          <button className="tile add" onClick={() => setAdding(true)}>
            <span className="tile-icon">
              <Plus size={22} />
            </span>
            <span className="tile-title">Add site</span>
          </button>
        </div>
      </div>

      {adding && (
        <AddSite
          onClose={(item) => {
            setAdding(false)
            if (item) saveSettings({ speedDial: [...dial, item] })
          }}
        />
      )}
    </div>
  )
}

function AddSite({ onClose }: { onClose: (item: SpeedDialItem | null) => void }): React.JSX.Element {
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const resolved = toUrl(url)

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose(null)}>
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault()
          if (resolved) onClose({ id: crypto.randomUUID(), title: title.trim() || hostOf(resolved), url: resolved })
        }}
      >
        <h2>Add to speed dial</h2>
        <p>Pin a site to your new tab page.</p>
        <div className="stack">
          <input className="field" autoFocus placeholder="Address, e.g. discord.com" value={url} onChange={(e) => setUrl(e.target.value)} />
          <input className="field" placeholder="Name (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="buttons">
          <button type="button" className="btn" onClick={() => onClose(null)}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!resolved}>
            Add
          </button>
        </div>
      </form>
    </div>
  )
}

function useClock(): Date {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}
