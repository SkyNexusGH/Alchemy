import type { CSSProperties, ReactNode } from 'react'

/**
 * Alchemy's own icon set. Drawn on a 24px grid with a 1.8 stroke, rounded joins and
 * soft, rounded shapes. Same prop names as the usual icon
 * libraries (size, strokeWidth, fill) so they drop in anywhere.
 */

export interface IconProps {
  size?: number
  strokeWidth?: number
  fill?: string
  className?: string
  style?: CSSProperties
  title?: string
}

export type Icon = (props: IconProps) => React.JSX.Element

function icon(body: ReactNode): Icon {
  return function AlchemyIcon({ size = 18, strokeWidth = 1.8, fill = 'none', className, style, title }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={fill}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        style={{ flexShrink: 0, ...style }}
        aria-hidden={!title}
        role={title ? 'img' : undefined}
      >
        {title && <title>{title}</title>}
        {body}
      </svg>
    )
  }
}

/** A decagon like the logo's outer ring, centered at 12,12. */
function decagon(r: number): string {
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2 + Math.PI / 10
    pts.push(`${(12 + r * Math.cos(a)).toFixed(2)},${(12 + r * Math.sin(a)).toFixed(2)}`)
  }
  return pts.join(' ')
}

// ---- navigation ----------------------------------------------------------------------

export const ArrowLeft = icon(<path d="M19 12H5.5M11 6l-6 6 6 6" />)
export const ArrowRight = icon(<path d="M5 12h13.5M13 6l6 6-6 6" />)
export const RotateCw = icon(
  <>
    <path d="M19.5 12a7.5 7.5 0 1 1-2.6-5.7" />
    <path d="M19.5 4.5v4.2h-4.2" />
  </>
)
export const RotateCcw = icon(
  <>
    <path d="M4.5 12a7.5 7.5 0 1 0 2.6-5.7" />
    <path d="M4.5 4.5v4.2h4.2" />
  </>
)
export const RefreshCw = icon(
  <>
    <path d="M4.5 10.5a7.5 7.5 0 0 1 13.4-3.2L19.5 9" />
    <path d="M19.5 4.5V9H15" />
    <path d="M19.5 13.5a7.5 7.5 0 0 1-13.4 3.2L4.5 15" />
    <path d="M4.5 19.5V15H9" />
  </>
)
export const X = icon(<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />)
export const Plus = icon(<path d="M12 5v14M5 12h14" />)
export const Check = icon(<path d="M5 12.5l4.5 4.5L19 7.5" />)
export const ChevronDown = icon(<path d="M6.5 9.5L12 15l5.5-5.5" />)
export const ChevronUp = icon(<path d="M6.5 14.5L12 9l5.5 5.5" />)
export const ChevronRight = icon(<path d="M9.5 6.5L15 12l-5.5 5.5" />)
export const ChevronLeft = icon(<path d="M14.5 6.5L9 12l5.5 5.5" />)
export const EllipsisVertical = icon(
  <>
    <path d="M12 5.2l1 1-1 1-1-1z" fill="currentColor" />
    <path d="M12 11l1 1-1 1-1-1z" fill="currentColor" />
    <path d="M12 16.8l1 1-1 1-1-1z" fill="currentColor" />
  </>
)
export const ExternalLink = icon(
  <>
    <path d="M13.5 4.5h6v6M19.5 4.5L11 13" />
    <path d="M17 13.5v4.2a1.8 1.8 0 0 1-1.8 1.8H6.3a1.8 1.8 0 0 1-1.8-1.8V8.8A1.8 1.8 0 0 1 6.3 7h4.2" />
  </>
)
export const Expand = icon(<path d="M4.5 9.5v-5h5M19.5 9.5v-5h-5M4.5 14.5v5h5M19.5 14.5v5h-5" />)

// ---- browser ------------------------------------------------------------------------

export const Search = icon(
  <>
    <circle cx="10.8" cy="10.8" r="6.3" />
    <path d="M15.5 15.5l4.5 4.5" />
  </>
)
export const TextSearch = icon(
  <>
    <path d="M4 6h16M4 11h6M4 16h5" />
    <path d="M16 10.2l2.6 1.1 1.1 2.6-1.1 2.6-2.6 1.1-2.6-1.1-1.1-2.6 1.1-2.6z" />
    <path d="M18.8 18.8l1.7 1.7" />
  </>
)
export const Pipette = icon(
  <>
    <path d="M14.5 6.5l3 3M16 3.5a2.1 2.1 0 0 1 3 0l1.5 1.5a2.1 2.1 0 0 1 0 3L18 10.5 13.5 6z" />
    <path d="M15 9L6.5 17.5l-2.5 3-.5-.5 3-2.5L15 9" />
    <path d="M12 6l6 6" />
  </>
)

export const Globe = icon(
  <>
    <polygon points={decagon(8.6)} />
    <path d="M3.6 12h16.8M12 3.4c2.4 2.5 3.4 5.4 3.4 8.6s-1 6.1-3.4 8.6c-2.4-2.5-3.4-5.4-3.4-8.6s1-6.1 3.4-8.6z" />
  </>
)
export const Lock = icon(
  <>
    <rect x="5" y="10.5" width="14" height="10" rx="2.8" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </>
)
export const Info = icon(
  <>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M12 11v5.2M12 7.8v.1" />
  </>
)
export const TriangleAlert = icon(
  <>
    <path d="M12 4l9 15.5H3z" />
    <path d="M12 10v4M12 16.8v.1" />
  </>
)
export const Star = icon(<path d="M12 3.9l2.45 4.97 5.48.8-3.97 3.86.94 5.46L12 16.41l-4.9 2.58.94-5.46-3.97-3.86 5.48-.8z" />)
export const Bookmark = icon(<path d="M7 3.8h10a1 1 0 0 1 1 1v15.4L12 16.3l-6 3.9V4.8a1 1 0 0 1 1-1z" />)
export const BookmarkPlus = icon(
  <>
    <path d="M6.5 3.8h11v16.4L12 16l-5.5 4.2z" />
    <path d="M12 7.5v5M9.5 10h5" />
  </>
)
export const Clock = icon(
  <>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M12 7.6V12l3 1.9" />
  </>
)
export const Download = icon(
  <>
    <path d="M12 3.8v11M7.6 10.5l4.4 4.4 4.4-4.4" />
    <path d="M4.5 15.5v2.2a2.3 2.3 0 0 0 2.3 2.3h10.4a2.3 2.3 0 0 0 2.3-2.3v-2.2" />
  </>
)
export const Upload = icon(
  <>
    <path d="M12 14.5V4M7.5 8.5L12 4l4.5 4.5" />
    <path d="M4.5 16.5v3h15v-3" />
  </>
)
export const FileDown = icon(
  <>
    <path d="M6 3.5h8l4 4v13H6z" />
    <path d="M14 3.5v4h4M12 10.5v6M9.5 14l2.5 2.5 2.5-2.5" />
  </>
)
export const Folder = icon(<path d="M3.5 6.5h6l2 2h9v10.5h-17z" />)
export const FolderPlus = icon(
  <>
    <path d="M3.5 6.5h6l2 2h9v10.5h-17z" />
    <path d="M12 11.5v5M9.5 14h5" />
  </>
)
export const Pencil = icon(
  <>
    <path d="M15.5 4.5l4 4L9 19H5v-4z" />
    <path d="M13 7l4 4" />
  </>
)
export const Trash2 = icon(
  <>
    <path d="M4.5 6.5h15M9.5 6.5V5a1.2 1.2 0 0 1 1.2-1.2h2.6A1.2 1.2 0 0 1 14.5 5v1.5" />
    <path d="M6.3 6.5l.9 12.3a1.6 1.6 0 0 0 1.6 1.5h6.4a1.6 1.6 0 0 0 1.6-1.5l.9-12.3" />
    <path d="M10.2 10.5v5.8M13.8 10.5v5.8" />
  </>
)
export const Copy = icon(
  <>
    <rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.4" />
    <path d="M15.5 8.5V6.4A2.4 2.4 0 0 0 13.1 4H6.4A2.4 2.4 0 0 0 4 6.4v6.7a2.4 2.4 0 0 0 2.4 2.4h2.1" />
  </>
)
export const Pin = icon(
  <>
    <path d="M9.2 3.8h5.6M10 3.8v5.4L6.8 12.6v1.6h10.4v-1.6L14 9.2V3.8" />
    <path d="M12 14.2v6" />
  </>
)
export const Printer = icon(
  <>
    <path d="M7 8.5v-5h10v5" />
    <path d="M7 16.5H4.5v-8h15v8H17" />
    <path d="M7 13.5h10v7H7z" />
  </>
)
export const Code = icon(<path d="M8.5 7L3.5 12l5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15" />)
export const ZoomIn = icon(
  <>
    <path d="M10.5 3.8l4.7 1.9 1.9 4.8-1.9 4.7-4.7 1.9-4.8-1.9-1.9-4.7 1.9-4.8z" />
    <path d="M15.4 15.4l4.6 4.6M10.5 8v5M8 10.5h5" />
  </>
)
export const ZoomOut = icon(
  <>
    <path d="M10.5 3.8l4.7 1.9 1.9 4.8-1.9 4.7-4.7 1.9-4.8-1.9-1.9-4.7 1.9-4.8z" />
    <path d="M15.4 15.4l4.6 4.6M8 10.5h5" />
  </>
)
export const AppWindow = icon(
  <>
    <path d="M3.5 5h17v14h-17z" />
    <path d="M3.5 9h17M6.5 7h.1M9 7h.1" />
  </>
)
export const PanelTop = icon(
  <>
    <path d="M3.5 5h17v14h-17z" />
    <path d="M3.5 9.5h17" />
  </>
)
export const Columns2 = icon(
  <>
    <rect x="3.5" y="5" width="17" height="14" rx="2.6" />
    <path d="M12 5v14" />
  </>
)
export const LayoutGrid = icon(
  <>
    <path d="M7.5 3.5l4 4-4 4-4-4z" />
    <path d="M16.5 3.5l4 4-4 4-4-4z" />
    <path d="M7.5 12.5l4 4-4 4-4-4z" />
    <path d="M16.5 12.5l4 4-4 4-4-4z" />
  </>
)
export const Settings = icon(
  <>
    <path d="M10.3 3.6h3.4l.6 2.3 1.6.9 2.3-.7 1.7 2.9-1.7 1.7v1.8l1.7 1.7-1.7 2.9-2.3-.7-1.6.9-.6 2.3h-3.4l-.6-2.3-1.6-.9-2.3.7-1.7-2.9 1.7-1.7v-1.8L4.1 9l1.7-2.9 2.3.7 1.6-.9z" />
    <circle cx="12" cy="12" r="2.8" />
  </>
)
export const Puzzle = icon(
  <path d="M5 8.5h3.6a2.1 2.1 0 1 1 4.2 0h3.7v3.7a2.1 2.1 0 1 1 0 4.2v3.6h-3.6a2.1 2.1 0 1 0-4.2 0H5v-3.6a2.1 2.1 0 1 0 0-4.2z" />
)
export const Store = icon(
  <>
    <path d="M4 9l1.5-4.5h13L20 9" />
    <path d="M4 9h16v1.5a2.7 2.7 0 0 1-5.3 0 2.7 2.7 0 0 1-5.4 0 2.7 2.7 0 0 1-5.3 0z" />
    <path d="M5.5 12.5v7h13v-7M10 19.5V15h4v4.5" />
  </>
)
export const Moon = icon(<path d="M19.5 14.5A8 8 0 1 1 9.5 4.5a6.5 6.5 0 0 0 10 10z" />)
export const Sun = icon(
  <>
    <circle cx="12" cy="12" r="3.8" />
    <path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4" />
  </>
)
export const Monitor = icon(
  <>
    <rect x="3.5" y="4.5" width="17" height="11.5" rx="2.4" />
    <path d="M9 20h6M12 16v4" />
  </>
)
export const Volume2 = icon(
  <>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
    <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
  </>
)
export const VolumeX = icon(
  <>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
    <path d="M15.5 9.5l5 5M20.5 9.5l-5 5" />
  </>
)
export const Play = icon(<path d="M7.5 4.8l11 7.2-11 7.2z" />)
export const Pause = icon(<path d="M7.5 5v14M16.5 5v14" />)
export const CircleX = icon(
  <>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6" />
  </>
)
export const VenetianMask = icon(
  <>
    <path d="M2.8 9.2c0-1.3 1-2.2 2.3-2.1 2.6.2 4.4 1 6.9 1s4.3-.8 6.9-1c1.3-.1 2.3.8 2.3 2.1 0 4.3-2.4 7.1-5.6 7.1-1.8 0-2.6-1.6-3.6-1.6s-1.8 1.6-3.6 1.6c-3.2 0-5.6-2.8-5.6-7.1z" />
    <path d="M6.8 11.3c.9-.6 2.2-.6 3 .2M14.2 11.5c.8-.8 2.1-.8 3-.2" />
  </>
)
/** Alchemy Tor: an onion's layers, the way the Tor network wraps each connection. */
export const Onion = icon(
  <>
    <path d="M12 6.2c-4.2 1.3-7 4.2-7 7.7 0 3.6 3.1 6.1 7 6.1s7-2.5 7-6.1c0-3.5-2.8-6.4-7-7.7z" />
    <path d="M12 9.6c-2.4 1-3.9 2.6-3.9 4.5 0 2 1.7 3.4 3.9 3.4s3.9-1.4 3.9-3.4c0-1.9-1.5-3.5-3.9-4.5z" />
    <path d="M12 6.2V4.5c0-1 .7-1.7 1.8-2" />
  </>
)
export const Power = icon(<path d="M12 3.5V11M7 6.5a7.5 7.5 0 1 0 10 0" />)
// ---- protection ------------------------------------------------------------------------

const shield = 'M12 3.2l6.6 2.4a1.4 1.4 0 0 1 .9 1.3v5.2c0 4.2-3 7.3-7.5 8.9-4.5-1.6-7.5-4.7-7.5-8.9V6.9a1.4 1.4 0 0 1 .9-1.3z'
export const Shield = icon(<path d={shield} />)
export const ShieldCheck = icon(
  <>
    <path d={shield} />
    <path d="M8.8 12l2.2 2.2 4.3-4.4" />
  </>
)
export const ShieldOff = icon(
  <>
    <path d={shield} />
    <path d="M4 4l16 16" />
  </>
)
export const ShieldAlert = icon(
  <>
    <path d={shield} />
    <path d="M12 8.5v4M12 15.5v.1" />
  </>
)
export const CloudOff = icon(
  <>
    <path d="M7 18.5a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.3 1.6 3.8 3.8 0 0 1-.8 7.4z" />
    <path d="M4 4l16 16" />
  </>
)
export const Unplug = icon(
  <>
    <path d="M14.5 9.5L17 7M9.5 14.5L7 17M4 20l3-3M20 4l-3 3" />
    <path d="M11 6.5l6.5 6.5-2 2a4 4 0 0 1-5.6 0l-.9-.9a4 4 0 0 1 0-5.6z" />
    <path d="M8.5 11.5L6.5 9.5" />
  </>
)
export const Frown = icon(
  <>
    <polygon points={decagon(8.6)} />
    <path d="M8.5 16a4.5 4.5 0 0 1 7 0M9 9.8v.1M15 9.8v.1" />
  </>
)

// ---- settings & wizard ------------------------------------------------------------------

export const Palette = icon(
  <>
    <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.5 0 2-1 1.5-2.2-.5-1.3.2-2.3 1.6-2.3h1.9a3.5 3.5 0 0 0 3.5-3.5c0-5-3.8-9-8.5-9z" />
    <path d="M7.5 11.5h.1M9.5 7.5h.1M14.5 7.5h.1" />
  </>
)
export const ImageIcon = icon(
  <>
    <path d="M3.5 5h17v14h-17z" />
    <path d="M3.5 16l5-5 4 4 2.5-2.5 5.5 5.5M15.5 9h.1" />
  </>
)
export const Layers = icon(
  <>
    <path d="M12 3.5l8.5 4.5-8.5 4.5L3.5 8z" />
    <path d="M3.5 12l8.5 4.5 8.5-4.5M3.5 16l8.5 4.5 8.5-4.5" />
  </>
)
export const Sidebar = icon(
  <>
    <path d="M3.5 5h17v14h-17z" />
    <path d="M9 5v14M5.8 8.5h1M5.8 11h1" />
  </>
)
export const Rocket = icon(
  <>
    <path d="M12 20l-3-3c0-6 2-10.5 7.5-13 0 5.5-1.5 9.5-4.5 13z" />
    <path d="M9 17l-3.5-1 2.5-3.5h3M12 20l1 3.5 3.5-2.5v-3" />
    <path d="M14 9.5h.1" />
  </>
)
export const Sparkle = icon(<path d="M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z" />)
export const Keyboard = icon(
  <>
    <path d="M3 6.5h18v11H3z" />
    <path d="M6.5 10h.1M10 10h.1M14 10h.1M17.5 10h.1M8 14h8" />
  </>
)
export const Gauge = icon(
  <>
    <path d="M4 16a8 8 0 1 1 16 0" />
    <path d="M12 16l3.5-5M6.5 16h.1M17.5 16h.1" />
  </>
)
export const Wrench = icon(
  <path d="M14.5 4a4.5 4.5 0 0 0-4 6.3L4 16.8 7.2 20l6.5-6.5A4.5 4.5 0 0 0 20 9.5l-3 3-3-3 3-3a4.5 4.5 0 0 0-2.5-2.5z" />
)
export const Logo = icon(
  <>
    <polygon points={decagon(9.6)} strokeWidth={2.2} />
    <path d="M8 8.6h8l3.4 3.4-3.4 3.4H8L4.6 12z" strokeWidth={1.2} />
    <path d="M12 7.2l4.8 4.8-4.8 4.8L7.2 12z" fill="currentColor" stroke="none" />
  </>
)

// ---- workspace icons --------------------------------------------------------------------

export const WORKSPACE_ICONS: Record<string, { label: string; icon: Icon }> = {
  home: { label: 'Home', icon: icon(<path d="M4 11l8-7 8 7M6 9.5V20h4.5v-5h3v5H18V9.5" />) },
  work: {
    label: 'Work',
    icon: icon(
      <>
        <path d="M3.5 8h17v11.5h-17z" />
        <path d="M9 8V5h6v3M3.5 13h17M11 13v2h2v-2" />
      </>
    )
  },
  games: {
    label: 'Games',
    icon: icon(
      <>
        <path d="M7 7.5h10l3.5 4-1.5 6.5-3.5-.5-2-3h-3l-2 3-3.5.5L3.5 11.5z" />
        <path d="M8 10.5v3M6.5 12h3M15.5 11h.1M17 13h.1" />
      </>
    )
  },
  music: {
    label: 'Music',
    icon: icon(
      <>
        <path d="M9 17.5V5.5l10-2v12" />
        <path d="M9 17.5l-2 2-2-2 2-2zM19 15.5l-2 2-2-2 2-2z" />
      </>
    )
  },
  study: {
    label: 'Study',
    icon: icon(
      <>
        <path d="M12 5l9.5 4.5L12 14 2.5 9.5z" />
        <path d="M6.5 11.5V16c3.5 2.5 7.5 2.5 11 0v-4.5M21.5 9.5V15" />
      </>
    )
  },
  shopping: {
    label: 'Shopping',
    icon: icon(
      <>
        <path d="M5.5 8h13l-1 12h-11z" />
        <path d="M9 10V7a3 3 0 0 1 6 0v3" />
      </>
    )
  },
  travel: {
    label: 'Travel',
    icon: icon(<path d="M3.5 13l7-1 5-7.5h2l-2.5 7.5 5-.5 1.5-2h1.5l-1 4 1 4h-1.5L20 15.5l-5-.5 2.5 7.5h-2l-5-7.5-7-1z" />)
  },
  chat: {
    label: 'Social',
    icon: icon(
      <>
        <path d="M4 5h16v11h-9l-4.5 3.5V16H4z" />
        <path d="M8 10.5h.1M12 10.5h.1M16 10.5h.1" />
      </>
    )
  },
  creative: { label: 'Creative', icon: Palette },
  science: {
    label: 'Lab',
    icon: icon(
      <>
        <path d="M9.5 3.5h5M10.5 3.5v6l-5.5 9.5h14l-5.5-9.5v-6" />
        <path d="M7.5 14.5h9" />
      </>
    )
  },
  finance: {
    label: 'Finance',
    icon: icon(
      <>
        <path d="M4 19.5h16M6.5 16v-4M10.5 16V8.5M14.5 16v-5.5M18.5 16V5" />
      </>
    )
  },
  love: {
    label: 'Personal',
    icon: icon(<path d="M12 20l-7.5-7.5a4.5 4.5 0 0 1 6.4-6.4l1.1 1.1 1.1-1.1a4.5 4.5 0 0 1 6.4 6.4z" />)
  },
  code: { label: 'Code', icon: Code },
  video: {
    label: 'Video',
    icon: icon(
      <>
        <path d="M3.5 6h12v12h-12z" />
        <path d="M15.5 10.5l5-3v9l-5-3" />
      </>
    )
  },
  photo: {
    label: 'Photos',
    icon: icon(
      <>
        <path d="M3.5 7.5h4l1.5-2.5h6l1.5 2.5h4v12h-17z" />
        <path d="M12 9.8l2.6 2.6-2.6 2.6-2.6-2.6z" />
      </>
    )
  },
  star: { label: 'Favorites', icon: Star },
  nature: {
    label: 'Nature',
    icon: icon(
      <>
        <path d="M12 3.5l6 8h-3l4 6H5l4-6H6z" />
        <path d="M12 17.5V21" />
      </>
    )
  },
  fitness: {
    label: 'Fitness',
    icon: icon(<path d="M3.5 9.5v5M6.5 7v10M17.5 7v10M20.5 9.5v5M6.5 12h11" />)
  },
  food: {
    label: 'Food',
    icon: icon(
      <>
        <path d="M5 11.5h14a7 7 0 0 1-14 0z" />
        <path d="M9 8c0-1.5 1-1.5 1-3M13 8c0-1.5 1-1.5 1-3" />
      </>
    )
  },
  rocket: { label: 'Projects', icon: Rocket },
  globe: { label: 'World', icon: Globe },
  news: {
    label: 'News',
    icon: icon(
      <>
        <path d="M4 5h12.5v14H6a2 2 0 0 1-2-2z" />
        <path d="M16.5 9H20v8a2 2 0 0 1-2 2h-1.5M7.5 8.5h5.5M7.5 12h5.5M7.5 15.5h3.5" />
      </>
    )
  },
  book: {
    label: 'Reading',
    icon: icon(
      <>
        <path d="M12 6.5c-2-1.5-5-2-8.5-1.5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5c-3.5-.5-6.5 0-8.5 1.5z" />
        <path d="M12 6.5v13" />
      </>
    )
  },
  movie: {
    label: 'Movies',
    icon: icon(
      <>
        <path d="M3.5 9h17v10.5h-17z" />
        <path d="M3.5 9l1-4.5 16 1.5-.5 3M8.5 5l-1 4M13.5 5.5l-1 3.5" />
      </>
    )
  },
  headphones: {
    label: 'Listening',
    icon: icon(
      <>
        <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
        <path d="M4 14.5h3.5v6H4zM16.5 14.5H20v6h-3.5z" />
      </>
    )
  },
  sport: {
    label: 'Sports',
    icon: icon(
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5l4 3-1.5 4.5h-5L8 10.5zM12 3.5v4M16 10.5l4-1.5M14.5 15l2.5 3.5M9.5 15L7 18.5M8 10.5L4 9" />
      </>
    )
  },
  car: {
    label: 'Cars',
    icon: icon(
      <>
        <path d="M3.5 16.5v-4l2-5h13l2 5v4z" />
        <path d="M3.5 12.5h17M7 16.5V19M17 16.5V19M7 14.5h.1M17 14.5h.1" />
      </>
    )
  },
  pet: {
    label: 'Pets',
    icon: icon(
      <>
        <path d="M12 12c-3 0-5.5 3-5.5 5.5 0 2 2 2.5 3 2s1.5-.5 2.5-.5 1.5 0 2.5.5 3 0 3-2c0-2.5-2.5-5.5-5.5-5.5z" />
        <path d="M5.5 10.5h.1M9.5 6.5h.1M14.5 6.5h.1M18.5 10.5h.1" strokeWidth={3.5} />
      </>
    )
  },
  coffee: {
    label: 'Break',
    icon: icon(
      <>
        <path d="M4.5 9h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5z" />
        <path d="M16.5 10.5h1.5a2.5 2.5 0 0 1 0 5h-1.5M8.5 3.5v2.5M12.5 3.5v2.5" />
      </>
    )
  },
  calendar: {
    label: 'Planning',
    icon: icon(
      <>
        <path d="M4 6h16v14H4z" />
        <path d="M4 10.5h16M8.5 3.5V8M15.5 3.5V8M8 14h.1M12 14h.1M16 14h.1M8 17h.1M12 17h.1" />
      </>
    )
  },
  mail: {
    label: 'Mail',
    icon: icon(
      <>
        <path d="M3.5 6h17v12.5h-17z" />
        <path d="M3.5 6.5L12 13l8.5-6.5" />
      </>
    )
  },
  cart: {
    label: 'Deals',
    icon: icon(
      <>
        <path d="M2.5 4h3l2.5 11h11l2-7.5H6.5" />
        <path d="M9.5 19.5h.1M17 19.5h.1" strokeWidth={3} />
      </>
    )
  },
  bolt: { label: 'Fast', icon: icon(<path d="M13.5 2.5L5 13.5h6l-1 8 8.5-11h-6z" />) },
  moon: { label: 'Night', icon: icon(<path d="M19.5 14.5A8 8 0 1 1 9.5 4.5a6.5 6.5 0 0 0 10 10z" />) },
  sun: {
    label: 'Day',
    icon: icon(
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
      </>
    )
  },
  flag: {
    label: 'Goals',
    icon: icon(
      <>
        <path d="M5.5 21V3.5" />
        <path d="M5.5 4h12l-2.5 4 2.5 4h-12" />
      </>
    )
  },
  trophy: {
    label: 'Wins',
    icon: icon(
      <>
        <path d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0z" />
        <path d="M7.5 6H4.5a3 3 0 0 0 3 4.5M16.5 6h3a3 3 0 0 1-3 4.5M12 13.5V17M8.5 20.5h7l-1-3.5h-5z" />
      </>
    )
  },
  crown: { label: 'VIP', icon: icon(<path d="M4 18.5h16M4.5 16L3 7l5 4 4-6.5 4 6.5 5-4-1.5 9z" />) },
  ghost: {
    label: 'Fun',
    icon: icon(
      <>
        <path d="M5.5 20.5V11a6.5 6.5 0 0 1 13 0v9.5l-2.2-1.5-2.1 1.5-2.2-1.5-2.2 1.5-2.1-1.5z" />
        <path d="M9.5 10.5h.1M14.5 10.5h.1" strokeWidth={3} />
      </>
    )
  },
  terminal: {
    label: 'Terminal',
    icon: icon(
      <>
        <path d="M3.5 4.5h17v15h-17z" />
        <path d="M7.5 9.5l3 2.5-3 2.5M12.5 15h4" />
      </>
    )
  },
  server: {
    label: 'Servers',
    icon: icon(
      <>
        <path d="M4 4h16v7H4zM4 13h16v7H4z" />
        <path d="M7.5 7.5h.1M7.5 16.5h.1" strokeWidth={3} />
      </>
    )
  },
  lock: {
    label: 'Private',
    icon: icon(
      <>
        <path d="M5 10.5h14v10H5z" />
        <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3M12 14.5v2.5" />
      </>
    )
  },
  sparkle: { label: 'Ideas', icon: Sparkle },
  layers: { label: 'Stack', icon: Layers }
}

export function WorkspaceIcon({ id, size = 16 }: { id: string; size?: number }): React.JSX.Element | null {
  const entry = WORKSPACE_ICONS[id]
  if (!entry) return null
  const C = entry.icon
  return <C size={size} />
}

// ---- search engines ----------------------------------------------------------------------
// Each engine's own look (colors and mark), drawn small so they read at 16px.

const LETTER = { fontFamily: "'Segoe UI', system-ui, sans-serif", fontWeight: 800, textAnchor: 'middle' } as const

const ENGINE_LOGOS: Record<string, ReactNode> = {
  google: (
    <g fill="none" strokeWidth={3.2}>
      <path d="M19 12a7 7 0 0 1-2.05 4.95" stroke="#4285f4" />
      <path d="M12.2 12H19.6" stroke="#4285f4" />
      <path d="M16.95 16.95A7 7 0 0 1 7.05 16.95" stroke="#34a853" />
      <path d="M7.05 16.95A7 7 0 0 1 5.94 8.5" stroke="#fbbc05" />
      <path d="M5.94 8.5A7 7 0 0 1 16.95 7.05" stroke="#ea4335" />
    </g>
  ),
  duckduckgo: (
    <>
      <circle cx="12" cy="12" r="10.5" fill="#de5833" />
      <ellipse cx="12.4" cy="12.6" rx="5.6" ry="6.6" fill="#fff" />
      <circle cx="13.6" cy="10.2" r="1.15" fill="#2d4f8e" />
      <path d="M12.6 14l3.4-.8-.3 1.5z" fill="#fdd209" />
      <path d="M10.2 17.8c1.2.6 2.6.7 3.8.2" stroke="#67bd47" strokeWidth={1.4} fill="none" strokeLinecap="round" />
    </>
  ),
  brave: (
    <>
      <path d="M7 2.5h10l2.6 3-.9 2.3.6 1.7-2.6 9.3L12 22l-4.7-3.2-2.6-9.3.6-1.7-.9-2.3z" fill="#fb542b" />
      <path d="M9 10.2l3 1.6 3-1.6M9.6 15l2.4 1.6 2.4-1.6" stroke="#fff" strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  bing: (
    <>
      <defs>
        <linearGradient id="ov-bing" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#37bdff" />
          <stop offset="1" stopColor="#0b6cd1" />
        </linearGradient>
      </defs>
      <path d="M6.5 2.5l4 1.4v11.3l4.9-2.8-2.4-1.1-1.5-3.6 7.6 2.7v3.9L10.5 21.5l-4-2.2z" fill="url(#ov-bing)" />
    </>
  ),
  startpage: (
    <>
      <circle cx="12" cy="12" r="10.5" fill="#6573ff" />
      <circle cx="11" cy="11" r="4.2" stroke="#fff" strokeWidth={2.2} fill="none" />
      <path d="M14 14l3.6 3.6" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" />
    </>
  ),
  yahoo: (
    <>
      <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="#6001d2" />
      <text x="11" y="16.6" fontSize="12.5" fill="#fff" {...LETTER}>
        Y!
      </text>
    </>
  ),
  yandex: (
    <>
      <circle cx="12" cy="12" r="10.5" fill="#fc3f1d" />
      <path d="M13.2 18.5V6.4h-1.3c-2 0-3.2 1.1-3.2 2.9 0 1.6.7 2.4 2.1 3.4l1.2.8-3.3 5" stroke="#fff" strokeWidth={1.9} fill="none" strokeLinejoin="round" />
    </>
  ),
  ecosia: (
    <>
      <circle cx="12" cy="12" r="10.5" fill="#008009" />
      <path d="M12 18.5v-6M12 12.5c-3.2 0-4.8-2-4.8-4.6 3.1 0 4.8 1.9 4.8 4.6zM12 14.5c2.8 0 4.6-1.7 4.6-4.4-2.9 0-4.6 1.8-4.6 4.4z" fill="#fff" stroke="#fff" strokeWidth={1.2} strokeLinejoin="round" />
    </>
  ),
  qwant: (
    <>
      <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="#141a2b" />
      <circle cx="11.6" cy="11.4" r="5" stroke="#fff" strokeWidth={2.2} fill="none" />
      <path d="M14.4 14.2l3.4 3.4" stroke="#5c97ff" strokeWidth={2.6} strokeLinecap="round" />
    </>
  ),
  mojeek: (
    <>
      <circle cx="12" cy="12" r="10.5" fill="#7ab93c" />
      <text x="12" y="16.3" fontSize="12.5" fill="#fff" {...LETTER}>
        m
      </text>
    </>
  ),
  baidu: (
    <>
      <ellipse cx="7.2" cy="9" rx="1.9" ry="2.4" fill="#2932e1" />
      <ellipse cx="10.6" cy="5.6" rx="1.9" ry="2.4" fill="#2932e1" />
      <ellipse cx="14.4" cy="5.6" rx="1.9" ry="2.4" fill="#2932e1" />
      <ellipse cx="17.6" cy="9.2" rx="1.9" ry="2.4" fill="#2932e1" />
      <path d="M12 10.8c-2 0-3.1 2.3-4.6 4.1-1.4 1.7-1.6 4.4 1.1 4.6 1.4.1 2.3-.6 3.5-.6s2.1.7 3.5.6c2.7-.2 2.5-2.9 1.1-4.6-1.5-1.8-2.6-4.1-4.6-4.1z" fill="#2932e1" />
    </>
  ),
  kagi: (
    <>
      <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="#ffb319" />
      <text x="12" y="16.8" fontSize="13" fill="#1e1a39" {...LETTER}>
        k
      </text>
    </>
  )
}

export function EngineIcon({ id, size = 16 }: { id: string; size?: number }): React.JSX.Element {
  const logo = ENGINE_LOGOS[id]
  // The user's own engines get a plain globe.
  if (!logo) return <Globe size={size} style={{ color: 'var(--text-2)' }} />
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0 }} aria-hidden>
      {logo}
    </svg>
  )
}
