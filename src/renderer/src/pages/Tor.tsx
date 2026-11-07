import './tor.css'
import { useEffect, useState } from 'react'
import type { TorStatus } from '@shared/types'
import { api } from '../lib/api'
import { Onion } from '../lib/icons'
import { setPageIcon } from '../lib/ui'

document.title = 'Alchemy Tor'
setPageIcon('<path d="M2.8 9.2c0-1.3 1-2.2 2.3-2.1 2.6.2 4.4 1 6.9 1s4.3-.8 6.9-1c1.3-.1 2.3.8 2.3 2.1 0 4.3-2.4 7.1-5.6 7.1-1.8 0-2.6-1.6-3.6-1.6s-1.8 1.6-3.6 1.6c-3.2 0-5.6-2.8-5.6-7.1z"/>')

// Where to go once connected: the link that was opened in Alchemy Tor, or a new tab.
const then = new URLSearchParams(location.search).get('then') || 'alchemy://newtab/'

/** Shown while Alchemy Tor connects; moves on by itself once Tor is ready. */
export default function Tor(): React.JSX.Element {
  const [status, setStatus] = useState<TorStatus | null>(null)

  useEffect(() => {
    void api.invoke<TorStatus>('tor:status').then(setStatus)
    return api.on('tor', setStatus)
  }, [])

  useEffect(() => {
    if (status?.state === 'ready') void api.invoke('page:navigate', then)
  }, [status?.state])

  const failed = status?.state === 'error'
  const progress = status?.state === 'ready' ? 100 : (status?.progress ?? 0)

  return (
    <div className="tor-page">
      <div className="tor-card">
        <span className={`tor-mark${failed ? '' : ' pulsing'}`}>
          <Onion size={30} />
        </span>
        <h1>{failed ? 'Couldn’t connect to Tor' : status?.state === 'ready' ? 'Connected' : 'Connecting to Tor'}</h1>
        <p className="tor-step">
          {failed
            ? status?.message
            : status?.bridges
              ? 'Your network may block Tor, so Alchemy is going through Snowflake bridges. This can take a minute.'
              : status?.message || 'Starting Tor'}
        </p>
        {!failed && (
          <div className="tor-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <i style={{ width: `${Math.max(progress, 3)}%` }} />
          </div>
        )}
        {!failed && <span className="tor-percent">{progress}%</span>}
        <div className="tor-actions">
          {failed && (
            <button className="btn primary" onClick={() => api.invoke('tor:retry')}>
              Try again
            </button>
          )}
          {status && status.state !== 'ready' && (
            <button className="btn" onClick={() => api.invoke('tor:retry', !status.bridges)}>
              {status.bridges ? 'Connect without bridges' : 'Use bridges instead'}
            </button>
          )}
        </div>
        <p className="tor-note">
          Alchemy Tor hides your IP address from the sites you visit. It isn’t Tor Browser: for the strongest protection
          against tracking, use Tor Browser.
        </p>
      </div>
    </div>
  )
}
