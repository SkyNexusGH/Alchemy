import { useState } from 'react'
import { api } from '../lib/api'

const OPTIONS = [
  { key: 'history', label: 'Browsing history' },
  { key: 'cookies', label: 'Cookies and site data (signs you out of most sites)' },
  { key: 'cache', label: 'Cached images and files' },
  { key: 'downloads', label: 'Download list (files stay on disk)' },
  { key: 'permissions', label: 'Site permissions (camera, location, …)' }
] as const

export function ClearDataDialog({ onClose }: { onClose: (cleared: boolean) => void }): React.JSX.Element {
  const [picked, setPicked] = useState<Record<string, boolean>>({ history: true, cache: true })
  const [busy, setBusy] = useState(false)

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose(false)}>
      <div className="modal" role="dialog" aria-modal>
        <h2>Clear browsing data</h2>
        <p>Choose what to remove from this device. This can't be undone.</p>
        {OPTIONS.map((o) => (
          <label key={o.key} className="check">
            <input
              type="checkbox"
              checked={!!picked[o.key]}
              onChange={(e) => setPicked({ ...picked, [o.key]: e.target.checked })}
            />
            {o.label}
          </label>
        ))}
        <div className="buttons">
          <button className="btn" onClick={() => onClose(false)}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={busy || !Object.values(picked).some(Boolean)}
            onClick={async () => {
              setBusy(true)
              await api.invoke('data:clear', picked)
              onClose(true)
            }}
          >
            {busy ? 'Clearing…' : 'Clear data'}
          </button>
        </div>
      </div>
    </div>
  )
}
