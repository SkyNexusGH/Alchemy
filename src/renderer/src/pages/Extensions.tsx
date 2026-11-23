import './pages.css'
import './extensions.css'
import { Puzzle, RefreshCw, Search, Store, Trash2 } from '../lib/icons'
import { useEffect, useMemo, useState } from 'react'
import type { StoreExtension } from '@shared/types'
import { api } from '../lib/api'
import { setPageIcon } from '../lib/ui'

document.title = 'Extensions'
setPageIcon('<path d="M10 3h4v3a2 2 0 1 0 4 0V3h3v6h-3a2 2 0 1 0 0 4h3v8h-8v-3a2 2 0 1 0-4 0v3H3v-8h3a2 2 0 1 0 0-4H3V3h7z"/>')

interface ExtensionInfo {
  id: string
  name: string
  version: string
  description: string
  icon: string | null
  /** Set when it came from Alchemy Extensions. */
  storeId: string | null
}

type View = 'installed' | 'store' | 'chrome'

const SUGGESTED = [
  { id: 'nngceckbapebfimnlniiiahkandclblb', name: 'Bitwarden', why: 'Password manager' },
  { id: 'eimadpbcbfnmbkopoojfekhnkhdbieeh', name: 'Dark Reader', why: 'Dark mode for every site' },
  { id: 'mnjggcdmjocbbbhaepdhchncahnbgone', name: 'SponsorBlock', why: 'Skips YouTube sponsor segments' },
  { id: 'gebbhagfogifgggkldgodflihgfeippi', name: 'Return YouTube Dislike', why: 'Brings back dislike counts' }
]

const size = (n: number): string => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

/**
 * Extensions: what's installed, Alchemy Extensions (the community store, reviewed by hand) and
 * the Chrome Web Store. Store extensions keep themselves up to date.
 */
export default function Extensions(): React.JSX.Element {
  const [view, setView] = useState<View>(() => (location.hash.slice(1) as View) || 'installed')
  const [list, setList] = useState<ExtensionInfo[] | null>(null)
  useEffect(() => {
    const load = (): void => void api.invoke<ExtensionInfo[]>('extensions:list').then(setList)
    load()
    const off1 = api.on('extensions', load)
    const off2 = api.on('store:installed', load)
    return () => (off1(), off2())
  }, [])
  useEffect(() => history.replaceState(null, '', `#${view}`), [view])

  return (
    <div className="page ext-page">
      <div className="page-head">
        <span className="page-icon">
          <Puzzle size={22} />
        </span>
        <h1>Extensions</h1>
      </div>
      <div className="ext-tabs" role="tablist">
        {(
          [
            ['installed', `Installed${list ? ` (${list.length})` : ''}`],
            ['store', 'Alchemy Extensions'],
            ['chrome', 'Chrome Web Store']
          ] as const
        ).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={view === id} className={view === id ? 'on' : ''} onClick={() => setView(id)}>
            {label}
          </button>
        ))}
      </div>
      {view === 'installed' && <Installed list={list} onBrowse={() => setView('store')} />}
      {view === 'store' && <AlchemyStore installed={list ?? []} />}
      {view === 'chrome' && <ChromeStore installed={list ?? []} />}
    </div>
  )
}

function Installed({ list, onBrowse }: { list: ExtensionInfo[] | null; onBrowse: () => void }): React.JSX.Element {
  const [checking, setChecking] = useState('')
  if (!list) return <div className="shimmer" style={{ height: 120, borderRadius: 14 }} />
  if (!list.length)
    return (
      <div className="ext-empty">
        <Puzzle size={36} />
        <b>No extensions yet</b>
        <span>Find some in Alchemy Extensions, or add any from the Chrome Web Store.</span>
        <button className="btn primary" onClick={onBrowse}>
          Browse Alchemy Extensions
        </button>
      </div>
    )
  const fromStore = list.some((e) => e.storeId)
  return (
    <>
      <div className="ext-list">
        {list.map((e) => (
          <div key={e.id} className="ext-row">
            {e.icon ? <img src={e.icon} width={40} height={40} alt="" className="ext-icon" /> : <span className="ext-icon letter">{e.name.charAt(0)}</span>}
            <div className="ext-text">
              <div className="ext-name">
                {e.name} <span className="ext-ver">{e.version}</span>
                <span className={`ext-source${e.storeId ? ' alchemy' : ''}`}>{e.storeId ? 'Alchemy Extensions' : 'Chrome Web Store'}</span>
              </div>
              <div className="ext-desc">{e.description}</div>
            </div>
            <button
              className="btn small danger"
              onClick={() => {
                if (confirm(`Remove “${e.name}”?`)) void api.invoke('extensions:remove', e.id)
              }}
            >
              <Trash2 size={13} /> Remove
            </button>
          </div>
        ))}
      </div>
      {fromStore && (
        <div className="ext-foot">
          <span>Extensions from Alchemy Extensions update by themselves.</span>
          <button
            className="btn small"
            disabled={!!checking}
            onClick={() => {
              setChecking('Checking…')
              void api.invoke<number>('store:update').then((n) => setChecking(n ? `${n} updated` : 'All up to date'))
            }}
          >
            <RefreshCw size={13} /> {checking || 'Check for updates'}
          </button>
        </div>
      )}
      <p className="ext-note">Ads and trackers are blocked by Aegis, so you don’t need an ad-block extension. Extensions don’t run in Masked Mode.</p>
    </>
  )
}

/** The main colour of an extension's icon, for its tile (the store allows reading its icons). */
const hueCache = new Map<string, Promise<string | null>>()
function iconHue(src: string): Promise<string | null> {
  const known = hueCache.get(src)
  if (known) return known
  const p = new Promise<string | null>((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = c.height = 24
        const g = c.getContext('2d', { willReadFrequently: true })!
        g.drawImage(img, 0, 0, 24, 24)
        const d = g.getImageData(0, 0, 24, 24).data
        let r = 0
        let gr = 0
        let b = 0
        let w = 0
        for (let i = 0; i < d.length; i += 4) {
          const max = Math.max(d[i], d[i + 1], d[i + 2])
          const min = Math.min(d[i], d[i + 1], d[i + 2])
          // Colourful, visible pixels count most; greys and see-through ones barely.
          const weight = (d[i + 3] / 255) * ((max - min) / 255 + 0.05) * (max > 30 ? 1 : 0.1)
          r += d[i] * weight
          gr += d[i + 1] * weight
          b += d[i + 2] * weight
          w += weight
        }
        resolve(w > 1 ? `rgb(${Math.round(r / w)} ${Math.round(gr / w)} ${Math.round(b / w)})` : null)
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
  hueCache.set(src, p)
  return p
}

/** The icon's colour; undefined while it's being worked out, null if it can't be. */
function useHue(src: string | null): string | null | undefined {
  const [hue, setHue] = useState<string | null | undefined>(src ? undefined : null)
  useEffect(() => {
    if (src) void iconHue(src).then(setHue)
  }, [src])
  return hue
}

const plural = (n: number, one: string, many: string): string => `${n.toLocaleString()} ${n === 1 ? one : many}`

function StoreIcon({ e, size }: { e: Pick<StoreExtension, 'icon' | 'name'>; size: number }): React.JSX.Element {
  return e.icon ? <img src={e.icon} width={size} height={size} alt="" className="ext-icon" /> : <span className="ext-icon letter">{e.name.charAt(0)}</span>
}

function Tile({ e, added, onOpen }: { e: StoreExtension; added: boolean; onOpen: () => void }): React.JSX.Element {
  // Neutral until the icon's colour is known; Alchemy's accent for extensions without an icon.
  const found = useHue(e.icon)
  const hue = found === undefined ? 'var(--text-3)' : (found ?? undefined)
  return (
    <button className="ext-tile" onClick={onOpen} style={hue ? ({ '--hue': hue } as React.CSSProperties) : undefined}>
      <span className="ext-art">
        <StoreIcon e={e} size={72} />
        {added && <span className="ext-added">Added</span>}
      </span>
      <span className="ext-tile-name">{e.name}</span>
      <span className="ext-tile-meta">
        {e.author} · {plural(e.installs, 'install', 'installs')}
      </span>
    </button>
  )
}

function AlchemyStore({ installed }: { installed: ExtensionInfo[] }): React.JSX.Element {
  const [data, setData] = useState<{ list: StoreExtension[]; url: string; error?: string } | null>(null)
  const [q, setQ] = useState('')
  const [category, setCategory] = useState<string | null>(null) // null: Discover; '': all
  const [open, setOpen] = useState<StoreExtension | null>(null)
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const load = (force = false): void => void api.invoke<NonNullable<typeof data>>('store:catalog', force).then(setData)
  useEffect(() => load(), [])
  const have = new Set(installed.map((e) => e.storeId).filter(Boolean))
  const list = useMemo(() => [...(data?.list ?? [])].sort((a, b) => b.installs - a.installs), [data])
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of list) m.set(e.category, (m.get(e.category) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [list])
  const query = q.trim().toLowerCase()
  const hits = list.filter((e) => (!category || e.category === category) && (!query || `${e.name} ${e.summary} ${e.author}`.toLowerCase().includes(query)))
  const listing = !!query || category !== null

  const install = async (e: StoreExtension): Promise<void> => {
    setBusy(e.id)
    setNote('')
    const r = await api.invoke<string>('store:install', e.id)
    setBusy('')
    if (r === 'installed') setNote(`${e.name} was added.`)
    else if (r === 'already') setNote(`You already have the newest ${e.name}.`)
    else if (r !== 'cancelled') setNote(r)
  }
  const grid = (items: StoreExtension[]): React.JSX.Element => (
    <div className="ext-tiles">
      {items.map((e) => (
        <Tile key={e.id} e={e} added={have.has(e.id)} onOpen={() => setOpen(e)} />
      ))}
    </div>
  )
  const shelf = (title: string, items: StoreExtension[], more?: () => void): React.JSX.Element | null =>
    items.length ? (
      <section key={title}>
        <div className="ext-shelf-head">
          <h2>{title}</h2>
          {more && <button onClick={more}>View all</button>}
        </div>
        {grid(items)}
      </section>
    ) : null

  return (
    <>
      <div className="ext-banner">
        <div>
          <div className="ext-eyebrow">Reviewed by hand</div>
          <h2>Make Alchemy yours.</h2>
          <p>Extensions made by the Alchemy community. Every one is checked before it’s listed, and Alchemy only installs what was approved.</p>
        </div>
        <div className="ext-banner-cta">
          {list.some((e) => e.icon) && (
            <div className="ext-stack">
              {list
                .filter((e) => e.icon)
                .slice(0, 4)
                .map((e) => (
                  <StoreIcon key={e.id} e={e} size={48} />
                ))}
            </div>
          )}
          <a className="btn" href={data ? `${data.url}/publish` : '#'}>
            Publish yours
          </a>
        </div>
      </div>
      <div className="ext-search">
        <Search size={16} />
        <input className="field" placeholder="Search extensions" aria-label="Search extensions" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {note && <div className="ext-msg">{note}</div>}
      {!data && <div className="shimmer" style={{ height: 220, borderRadius: 16 }} />}
      {data?.error && (
        <div className="ext-empty">
          <Store size={32} />
          <b>Couldn’t reach Alchemy Extensions</b>
          <span>{data.error}</span>
          <button className="btn" onClick={() => load(true)}>
            Try again
          </button>
        </div>
      )}
      {data && !data.error && (
        <div className="ext-browse">
          <aside className="ext-side">
            <div className="ext-eyebrow">Browse</div>
            <button className={category === null && !query ? 'on' : ''} onClick={() => (setCategory(null), setQ(''))}>
              Discover
            </button>
            <button className={category === '' ? 'on' : ''} onClick={() => setCategory('')}>
              All extensions <span>{list.length}</span>
            </button>
            {counts.length > 0 && <div className="ext-eyebrow" style={{ marginTop: 14 }}>Categories</div>}
            {counts.map(([c, n]) => (
              <button key={c} className={category === c ? 'on' : ''} onClick={() => setCategory(c)}>
                {c} <span>{n}</span>
              </button>
            ))}
          </aside>
          <div className="ext-shelves">
            {!list.length ? (
              <div className="ext-empty">No extensions are listed yet.</div>
            ) : listing ? (
              <section>
                <div className="ext-shelf-head">
                  <h2>{query ? `Results for “${q.trim()}”` : category || 'All extensions'}</h2>
                  <span className="ext-count">{plural(hits.length, 'extension', 'extensions')}</span>
                </div>
                {hits.length ? grid(hits) : <div className="ext-empty">Nothing matches. Try other words.</div>}
              </section>
            ) : (
              <>
                {shelf('Popular', list.slice(0, 8), () => setCategory(''))}
                {list.length > 4 &&
                  shelf(
                    'New and updated',
                    [...list].sort((a, b) => b.updated - a.updated).slice(0, 4)
                  )}
                {counts.filter(([, n]) => n >= 2).map(([c]) => shelf(c, list.filter((e) => e.category === c).slice(0, 4), () => setCategory(c)))}
              </>
            )}
          </div>
        </div>
      )}
      {open && <Detail e={open} url={data?.url ?? ''} added={have.has(open.id)} busy={busy === open.id} onAdd={() => void install(open)} onClose={() => setOpen(null)} />}
    </>
  )
}

function Detail(props: { e: StoreExtension; url: string; added: boolean; busy: boolean; onAdd: () => void; onClose: () => void }): React.JSX.Element {
  const { e } = props
  const hue = useHue(e.icon)
  useEffect(() => {
    const esc = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') props.onClose()
    }
    addEventListener('keydown', esc)
    return () => removeEventListener('keydown', esc)
  }, [props])
  return (
    <div className="modal-backdrop" onMouseDown={(ev) => ev.target === ev.currentTarget && props.onClose()}>
      <div className="modal ext-detail" role="dialog" aria-modal aria-label={e.name} style={hue ? ({ '--hue': hue } as React.CSSProperties) : undefined}>
        <div className="ext-detail-head">
          <StoreIcon e={e} size={64} />
          <div>
            <h2>{e.name}</h2>
            <div className="ext-by">
              by {e.authorUrl?.startsWith('https://') ? <a className="ext-author" href={e.authorUrl} title={`${e.author} on MyHue`}>{e.author}</a> : e.author} · <span className="ext-tag">{e.category}</span> · {plural(e.installs, 'install', 'installs')}
            </div>
          </div>
        </div>
        <p className="ext-summary">{e.summary}</p>
        {e.description && <div className="ext-long">{e.description}</div>}
        <dl className="ext-facts">
          <dt>Version</dt>
          <dd>{e.version}</dd>
          <dt>Size</dt>
          <dd>{size(e.size)}</dd>
          <dt>Updated</dt>
          <dd>{new Date(e.updated).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}</dd>
        </dl>
        <div className="ext-perms">
          <b>What it can do</b>
          {e.permissions.length ? e.permissions.map((p) => <code key={p}>{p}</code>) : <span className="ext-by">It asks for no special permissions.</span>}
        </div>
        <div className="buttons">
          <a className="btn" href={`${props.url}/e/${e.id}`}>
            Store page
          </a>
          <button className="btn" onClick={props.onClose}>
            Close
          </button>
          <button className="btn primary" disabled={props.added || props.busy} onClick={props.onAdd}>
            {props.added ? 'Added' : props.busy ? 'Adding…' : '+ Add to Alchemy'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ChromeStore({ installed }: { installed: ExtensionInfo[] }): React.JSX.Element {
  const have = new Set(installed.map((e) => e.id))
  const suggestions = SUGGESTED.filter((s) => !have.has(s.id))
  return (
    <>
      <div className="ext-hero">
        <div>
          <b>Chrome Web Store</b>
          <span>Most Chrome extensions work in Alchemy. Open the store and use “Add to Chrome”.</span>
        </div>
        <a className="btn primary" href="https://chromewebstore.google.com/">
          <Store size={15} /> Open the Chrome Web Store
        </a>
      </div>
      {suggestions.length > 0 && (
        <>
          <div className="group-title">Popular picks</div>
          <div className="ext-grid">
            {suggestions.map((s) => (
              <a key={s.id} className="ext-card" href={`https://chromewebstore.google.com/detail/${s.id}`}>
                <span className="ext-icon letter">{s.name.charAt(0)}</span>
                <div className="ext-text">
                  <div className="ext-name">{s.name}</div>
                  <div className="ext-by">{s.why}</div>
                </div>
              </a>
            ))}
          </div>
        </>
      )}
    </>
  )
}
