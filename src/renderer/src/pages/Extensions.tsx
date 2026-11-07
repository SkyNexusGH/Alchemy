import './pages.css'
import { Puzzle, Store, Trash2 } from '../lib/icons'
import { useEffect, useState } from 'react'
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
}

const SUGGESTED = [
  { id: 'nngceckbapebfimnlniiiahkandclblb', name: 'Bitwarden', why: 'Password manager' },
  { id: 'eimadpbcbfnmbkopoojfekhnkhdbieeh', name: 'Dark Reader', why: 'Dark mode for every site' },
  { id: 'mnjggcdmjocbbbhaepdhchncahnbgone', name: 'SponsorBlock', why: 'Skips YouTube sponsor segments' },
  { id: 'gebbhagfogifgggkldgodflihgfeippi', name: 'Return YouTube Dislike', why: 'Brings back dislike counts' }
]

export default function Extensions(): React.JSX.Element {
  const [list, setList] = useState<ExtensionInfo[] | null>(null)
  useEffect(() => {
    api.invoke<ExtensionInfo[]>('extensions:list').then(setList)
    return api.on('extensions', setList)
  }, [])

  const installed = new Set(list?.map((e) => e.id))
  const suggestions = SUGGESTED.filter((s) => !installed.has(s.id))

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <div className="page-head">
        <span className="page-icon">
          <Puzzle size={22} />
        </span>
        <h1>Extensions</h1>
        <span className="spacer" />
        <a className="btn primary" href="https://chromewebstore.google.com/">
          <Store size={15} /> Chrome Web Store
        </a>
      </div>

      <p style={{ color: 'var(--text-2)', lineHeight: 1.6, marginTop: -8 }}>
        Install extensions straight from the Chrome Web Store with “Add to Chrome”. Ads and trackers are blocked by
        the built-in Aegis blocker, so you don't need an ad-block extension. Extensions don't run in Masked Mode.
      </p>

      <div className="group-title">Installed</div>
      <div className="card" style={{ padding: 6 }}>
        {list?.length === 0 && (
          <div className="empty" style={{ padding: 40 }}>
            No extensions yet.
          </div>
        )}
        {list?.map((e) => (
          <div key={e.id} className="row" style={{ minHeight: 64 }}>
            {e.icon ? (
              <img src={e.icon} width={32} height={32} alt="" style={{ borderRadius: 8, flexShrink: 0 }} />
            ) : (
              <span className="page-icon" style={{ width: 32, height: 32, borderRadius: 8, boxShadow: 'none' }}>
                <Puzzle size={16} />
              </span>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>
                {e.name} <span style={{ color: 'var(--text-3)', fontWeight: 400, fontSize: 12 }}>{e.version}</span>
              </div>
              <div className="setting-hint" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {e.description}
              </div>
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

      {suggestions.length > 0 && (
        <>
          <div className="group-title">Popular picks</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {suggestions.map((s) => (
              <a key={s.id} className="card row" href={`https://chromewebstore.google.com/detail/${s.id}`} style={{ padding: '12px 16px' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{s.name}</div>
                  <div className="setting-hint">{s.why}</div>
                </div>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
