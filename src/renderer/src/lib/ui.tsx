import { Globe, Logo as LogoMark } from './icons'
import { useEffect, useState, type CSSProperties } from 'react'
import { hostOf } from '@shared/url'

/** The Alchemy mark, in one color (the current text color unless given). */
export function Logo({ size = 22, color }: { size?: number; color?: string }): React.JSX.Element {
  return <LogoMark size={size} style={color ? { color } : undefined} />
}

/** The Alchemy in-app icon (public/alchemy-icon.svg), drawn in the current accent color. */
export function BrandLogo({ size = 64 }: { size?: number }): React.JSX.Element {
  return <span className="brand-logo" role="img" aria-label="Alchemy" style={{ width: size, height: size }} />
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
