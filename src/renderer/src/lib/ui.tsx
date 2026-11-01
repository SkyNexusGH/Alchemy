import { Globe } from 'lucide-react'
import { useEffect, useState, type CSSProperties } from 'react'
import { hostOf } from '@shared/url'

/** The Ovyra mark: a gradient ring with an orbiting spark. */
export function Logo({ size = 22 }: { size?: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="ovyra-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--a)" />
          <stop offset="1" stopColor="var(--b)" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="10.5" fill="none" stroke="url(#ovyra-g)" strokeWidth="5" />
      <circle cx="25.5" cy="7" r="3.2" fill="#fff" />
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
        background: siteGradient(host),
        ...style
      }}
    >
      {host[0].toUpperCase()}
    </span>
  )
}

/** A stable, vivid gradient per site, so letter tiles are recognizable. */
export function siteGradient(host: string): string {
  let h = 0
  for (const c of host) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const hue = h % 360
  return `linear-gradient(135deg, hsl(${hue} 85% 62%), hsl(${(hue + 40) % 360} 80% 52%))`
}

export function setPageIcon(svgPath: string): void {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${svgPath}</svg>`
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
