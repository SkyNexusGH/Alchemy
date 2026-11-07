import './pages.css'
import { CloudOff, RotateCw, ShieldAlert, Unplug, Frown } from '../lib/icons'
import { hostOf } from '@shared/url'
import { useEffect } from 'react'
import { api } from '../lib/api'
import { ErrorArt, type ErrorArtKind } from './ErrorArt'
import { OfflineGame } from './OfflineGame'
import { setPageIcon } from '../lib/ui'

const params = new URLSearchParams(location.search)
const url = params.get('u') ?? ''
const code = params.get('c') ?? ''
const detail = params.get('d') ?? ''
const host = hostOf(url) || url

document.title = host
setPageIcon('<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>')

function describe(): { icon: typeof CloudOff; title: string; text: string; art: ErrorArtKind } {
  const n = Number(code)
  if (code === 'crashed')
    return { art: 'crashed', icon: Frown, title: 'This page crashed', text: 'Something went wrong while showing this page. Reloading usually fixes it.' }
  if (n === -106)
    return { art: 'offline', icon: Unplug, title: "You're offline", text: 'Check your internet connection, then try again.' }
  if (n === -105 || n === -137)
    return { art: 'missing', icon: CloudOff, title: "This site can't be reached", text: `${host}'s address couldn't be found. Check the spelling, or the site may be down.` }
  if (n <= -200 && n > -300)
    return {
      art: 'unsafe',
      icon: ShieldAlert,
      title: "This connection isn't private",
      text: `${host}'s security certificate isn't valid, so someone could be intercepting your connection. Alchemy stopped loading it to keep you safe.`
    }
  if (n === -102)
    return { art: 'missing', icon: CloudOff, title: "This site can't be reached", text: `${host} refused to connect.` }
  if (n === -118 || n === -7)
    return { art: 'slow', icon: CloudOff, title: 'This site took too long to respond', text: `${host} is taking too long. It may be overloaded or down.` }
  if (n === -310)
    return { art: 'missing', icon: CloudOff, title: "This page isn't working", text: `${host} redirected you too many times. Clearing cookies for the site may help.` }
  return { art: 'missing', icon: CloudOff, title: "This page couldn't load", text: `Something went wrong while loading ${host}.` }
}

export default function ErrorPage(): React.JSX.Element {
  const { title, text, art } = describe()
  const secure = Number(code) <= -200 && Number(code) > -300
  const offline = Number(code) === -106
  // Back online: try the page again by itself.
  useEffect(() => {
    if (!offline) return
    const retry = (): void => void api.invoke('page:navigate', url)
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [offline])
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 32 }}>
      <div style={{ maxWidth: 520 }}>
        <ErrorArt kind={art} />
        <h1 style={{ margin: '0 0 12px', fontSize: 26, fontWeight: 750, letterSpacing: '-0.02em' }}>{title}</h1>
        <p style={{ margin: 0, color: 'var(--text-2)', lineHeight: 1.6, fontSize: 14 }}>{text}</p>
        <p style={{ margin: '16px 0 28px', color: 'var(--text-3)', fontSize: 12, fontFamily: 'ui-monospace, Consolas, monospace' }}>
          {detail || code}
        </p>
        {!secure && (
          <button className="btn primary" onClick={() => api.invoke('page:navigate', url)}>
            <RotateCw size={15} /> Try again
          </button>
        )}
        {secure && (
          <button className="btn primary" onClick={() => history.back()}>
            Go back to safety
          </button>
        )}
        {offline && <OfflineGame />}
      </div>
    </div>
  )
}
