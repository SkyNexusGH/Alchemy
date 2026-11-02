import { Globe, Logo as LogoMark } from './icons'
import { useEffect, useId, useState, type CSSProperties } from 'react'
import { hostOf } from '@shared/url'

/** The Ovyra mark, in one color (the current text color unless given). */
export function Logo({ size = 22, color }: { size?: number; color?: string }): React.JSX.Element {
  return <LogoMark size={size} style={color ? { color } : undefined} />
}

// The logo's geometry, traced from the original artwork (375×375).
const DECAGON = '243.8,14 334.9,80 369.6,187 334.9,294 243.8,360.5 131.2,360.5 40.1,294 5.4,187 40.1,80 131.2,14'
const DECAGON_INNER = '233.6,45 307.7,98.8 336,187 307.7,275.2 233.6,329.5 141.4,329.5 67.3,275.2 39,187 67.3,98.8 141.4,45'
const HEXAGON = '94.8,128.9 280.2,128.9 338.8,187.5 280.2,246.1 94.8,246.1 36.2,187.5'
const DIAMOND = '187.5,95.6 288.6,187.5 187.5,279.4 86.4,187.5'
const DIAMOND_INNER = '187.5,118 264,187.5 187.5,257 111,187.5'

/** The full-color Ovyra logo as a vector, so it stays sharp at any size. */
export function BrandLogo({ size = 64 }: { size?: number }): React.JSX.Element {
  const id = useId().replace(/:/g, '')
  return (
    <svg width={size} height={size} viewBox="0 0 375 375" role="img" aria-label="Ovyra" className="brand-logo">
      <defs>
        <linearGradient id={`${id}r`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d4d7df" />
          <stop offset=".45" stopColor="#3a4561" />
          <stop offset="1" stopColor="#1b2b6b" />
        </linearGradient>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#111827" />
          <stop offset="1" stopColor="#13225e" />
        </linearGradient>
        <linearGradient id={`${id}h`} x1="0" y1="0" x2="1" y2=".4">
          <stop offset="0" stopColor="#eef0f4" />
          <stop offset=".55" stopColor="#a9b0c2" />
          <stop offset="1" stopColor="#3d4a72" />
        </linearGradient>
        <linearGradient id={`${id}d`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f7a8c8" />
          <stop offset="1" stopColor="#ef5a6e" />
        </linearGradient>
        <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ef4f93" />
          <stop offset="1" stopColor="#ea4a50" />
        </linearGradient>
      </defs>
      <polygon points={DECAGON} fill={`url(#${id}r)`} />
      <polygon points={DECAGON_INNER} fill={`url(#${id}b)`} />
      <polygon points={HEXAGON} fill={`url(#${id}h)`} />
      <polygon points={DIAMOND} fill={`url(#${id}d)`} />
      <polygon points={DIAMOND_INNER} fill={`url(#${id}f)`} />
    </svg>
  )
}

/** A site icon that falls back to a colorful letter tile when there's no favicon. */
export function Favicon({
  src,
  url,
  size = 16,
  style
}: {
  src?: string | null
  url?: string
  size?: number
  style?: CSSProperties
}): React.JSX.Element {
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [src])
  if (src && !broken) {
    return (
      <img
        className="favicon"
        src={src}
        width={size}
        height={size}
        style={style}
        draggable={false}
        onError={() => setBroken(true)}
        alt=""
      />
    )
  }
  const host = url ? hostOf(url) : ''
  if (!host) return <Globe size={size} style={{ opacity: 0.7, flexShrink: 0, ...style }} />
  return (
    <span
      className="letter-icon"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.62,
        background: siteColor(host),
        ...style
      }}
    >
      {host[0].toUpperCase()}
    </span>
  )
}

/** A stable color per site, so letter tiles are recognizable. */
export function siteColor(host: string): string {
  let h = 0
  for (const c of host) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return `hsl(${h % 360} 62% 50%)`
}

export function setPageIcon(svgPath: string): void {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#8b93a5" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${svgPath}</svg>`
  let link = document.querySelector<HTMLLinkElement>('link[rel=icon]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export function formatBytes(n: number): string {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1)
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`
}
