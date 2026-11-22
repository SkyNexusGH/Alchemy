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

function AlchemyStore({ installed }: { installed: ExtensionInfo[] }): React.JSX.Element {
  const [data, setData] = useState<{ list: StoreExtension[]; url: string; error?: string } | null>(null)
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [open, setOpen] = useState<StoreExtension | null>(null)
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const load = (force = false): void => void api.invoke<NonNullable<typeof data>>('store:catalog', force).then(setData)
  useEffect(() => load(), [])
  const have = new Set(installed.map((e) => e.storeId).filter(Boolean))
  const categories = useMemo(() => [...new Set((data?.list ?? []).map((e) => e.category))].sort(), [data])
  const shown = (data?.list ?? []).filter((e) => (!category || e.category === category) && (!q || `${e.name} ${e.summary} ${e.author}`.toLowerCase().includes(q.toLowerCase())))

  const install = async (e: StoreExtension): Promise<void> => {
    setBusy(e.id)
    setNote('')
    const r = await api.invoke<string>('store:install', e.id)
    setBusy('')
    if (r === 'installed') setNote(`${e.name} was added.`)
    else if (r === 'already') setNote(`You already have the newest ${e.name}.`)
    else if (r !== 'cancelled') setNote(r)
  }

  return (
    <>
      <div className="ext-hero">
        <div>
          <b>Alchemy Extensions</b>
          <span>Made by the Alchemy community and checked by hand before they’re listed. Alchemy only installs what was approved.</span>
        </div>
        <a className="btn" href={data ? `${data.url}/publish` : '#'}>
          Publish yours
        </a>
      </div>
      <div className="ext-search">
        <Search size={15} />
        <input className="field" placeholder="Search extensions" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {categories.length > 1 && (
        <div className="chips" style={{ marginBottom: 14 }}>
          {['', ...categories].map((c) => (
            <button key={c} className={`chip${c === category ? ' on' : ''}`} onClick={() => setCategory(c)}>
              {c || 'All'}
            </button>
          ))}
        </div>
      )}
      {note && <div className="ext-msg">{note}</div>}
      {!data && <div className="shimmer" style={{ height: 160, borderRadius: 14 }} />}
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
      {data && !data.error && shown.length === 0 && <div className="ext-empty">{q || category ? 'Nothing matches.' : 'No extensions are listed yet.'}</div>}
      <div className="ext-grid">
        {shown.map((e) => (
          <div key={e.id} className="ext-card" onClick={() => setOpen(e)}>
            {e.icon ? <img src={e.icon} width={44} height={44} alt="" className="ext-icon" /> : <span className="ext-icon letter">{e.name.charAt(0)}</span>}
            <div className="ext-text">
              <div className="ext-name">{e.name}</div>
              <div className="ext-by">
                by {e.author} · {e.installs.toLocaleString()} installs
              </div>
            </div>
            <p>{e.summary}</p>
            <button
              className={`btn small${have.has(e.id) ? '' : ' primary'}`}
              disabled={have.has(e.id) || busy === e.id}
              onClick={(ev) => {
                ev.stopPropagation()
                void install(e)
              }}
            >
              {have.has(e.id) ? 'Added' : busy === e.id ? 'Adding…' : 'Add'}
            </button>
          </div>
        ))}
      </div>
      {open && (
        <div className="modal-backdrop" onMouseDown={(ev) => ev.target === ev.currentTarget && setOpen(null)}>
          <div className="modal ext-detail" role="dialog" aria-modal>
            <div className="ext-detail-head">
              {open.icon ? <img src={open.icon} width={56} height={56} alt="" className="ext-icon" /> : <span className="ext-icon letter big">{open.name.charAt(0)}</span>}
              <div>
                <h2>{open.name}</h2>
                <div className="ext-by">
                  by {open.author} · {open.category} · version {open.version} · {size(open.size)}
                </div>
              </div>
            </div>
            <p>{open.summary}</p>
            {open.description && <div className="ext-long">{open.description}</div>}
            <div className="ext-perms">
              <b>What it can do</b>
              {open.permissions.length ? open.permissions.map((p) => <code key={p}>{p}</code>) : <span className="ext-by">It asks for no special permissions.</span>}
            </div>
            <div className="buttons">
              <a className="btn" href={`${data?.url}/e/${open.id}`}>
                Store page
              </a>
              <button className="btn" onClick={() => setOpen(null)}>
                Close
              </button>
              <button className="btn primary" disabled={have.has(open.id) || busy === open.id} onClick={() => void install(open)}>
                {have.has(open.id) ? 'Added' : busy === open.id ? 'Adding…' : 'Add to Alchemy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
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
