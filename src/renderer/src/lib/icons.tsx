import type { CSSProperties, ReactNode } from 'react'

/**
 * Ovyra's own icon set. Drawn on a 24px grid with a 1.8 stroke, rounded joins and
 * faceted, octagonal shapes that echo the logo. Same prop names as the usual icon
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
  return function OvyraIcon({ size = 18, strokeWidth = 1.8, fill = 'none', className, style, title }: IconProps) {
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
    <path d="M10.5 3.8l4.7 1.9 1.9 4.8-1.9 4.7-4.7 1.9-4.8-1.9-1.9-4.7 1.9-4.8z" />
    <path d="M15.4 15.4l4.6 4.6" />
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
    <path d="M7.5 10.5V8a4.5 4.5 0 0 1 9 0v2.5" />
    <path d="M5.5 10.5h13l-1 9h-11z" />
    <path d="M12 14v2" />
  </>
)
export const Info = icon(
  <>
    <polygon points={decagon(8.6)} />
    <path d="M12 11v5M12 7.8v.1" />
  </>
)
export const TriangleAlert = icon(
  <>
    <path d="M12 4l9 15.5H3z" />
    <path d="M12 10v4M12 16.8v.1" />
  </>
)
export const Star = icon(<path d="M12 3.8l2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8z" />)
export const Bookmark = icon(<path d="M6.5 3.8h11v16.4L12 16l-5.5 4.2z" />)
export const BookmarkPlus = icon(
  <>
    <path d="M6.5 3.8h11v16.4L12 16l-5.5 4.2z" />
    <path d="M12 7.5v5M9.5 10h5" />
  </>
)
export const Clock = icon(
  <>
    <polygon points={decagon(8.6)} />
    <path d="M12 7.5V12l3 2" />
  </>
)
export const Download = icon(
  <>
    <path d="M12 4v10.5M7.5 10l4.5 4.5 4.5-4.5" />
    <path d="M4.5 16.5v3h15v-3" />
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
    <path d="M4.5 6.5h15M9.5 6.5V4h5v2.5" />
    <path d="M6.5 6.5l1 13.5h9l1-13.5" />
    <path d="M10.2 10.5v6M13.8 10.5v6" />
  </>
)
export const Copy = icon(
  <>
    <path d="M8.5 8.5h11v11h-11z" />
    <path d="M15.5 8.5v-4h-11v11h4" />
  </>
)
export const Pin = icon(
  <>
    <path d="M9 3.8h6l-1 6 3.5 3.2h-11L10 9.8z" />
    <path d="M12 13v7.2" />
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
    <path d="M3.5 5h17v14h-17z" />
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
    <polygon points={decagon(8.4)} />
    <path d="M12 8.2l3.8 3.8-3.8 3.8L8.2 12z" />
  </>
)
export const Puzzle = icon(
  <path d="M4.5 8.5h4a2 2 0 1 1 4 0h4v4a2 2 0 1 1 0 4v4h-4a2 2 0 1 0-4 0h-4v-4a2 2 0 1 0 0-4z" />
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
    <path d="M12 8l2.8 1.2L16 12l-1.2 2.8L12 16l-2.8-1.2L8 12l1.2-2.8z" />
    <path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4" />
  </>
)
export const Monitor = icon(
  <>
    <path d="M3.5 4.5h17v11.5h-17z" />
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
    <polygon points={decagon(8.6)} />
    <path d="M9.3 9.3l5.4 5.4M14.7 9.3l-5.4 5.4" />
  </>
)
export const VenetianMask = icon(
  <path d="M3 8.5c3 0 5.5 1.2 9 1.2s6-1.2 9-1.2c0 5-2.5 7.5-5.5 7.5-1.7 0-2.6-1.3-3.5-1.3s-1.8 1.3-3.5 1.3C5.5 16 3 13.5 3 8.5zM8 11.5h1.5M14.5 11.5H16" />
)

// ---- protection ------------------------------------------------------------------------

const shield = 'M12 3l7.5 2.8v6c0 4.5-3.2 7.6-7.5 9.2-4.3-1.6-7.5-4.7-7.5-9.2v-6z'
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
// Simple marks drawn for Ovyra (not the companies' logos), in each engine's color.

export const ENGINE_MARKS: Record<string, { color: string; icon: Icon }> = {
  google: {
    color: '#4285f4',
    icon: icon(<path d="M19.5 11.2h-7.3v2.9h4.3c-.5 2.1-2.3 3.5-4.5 3.5a5.6 5.6 0 0 1 0-11.2c1.4 0 2.6.5 3.6 1.3l2.1-2.1A8.6 8.6 0 1 0 20.6 12c0-.3 0-.5-.1-.8z" />)
  },
  duckduckgo: {
    color: '#de5833',
    icon: icon(
      <>
        <polygon points={decagon(8.6)} />
        <path d="M9.5 9.5h.1M14 9.5h.1M10 14c1.2 1 2.8 1 4 0" />
      </>
    )
  },
  brave: {
    color: '#fb542b',
    icon: icon(
      <>
        <path d="M7.5 3.5h9l2.5 3-1.5 9-5.5 5-5.5-5-1.5-9z" />
        <path d="M9.5 10l2.5 1.5 2.5-1.5M10.5 15l1.5 1 1.5-1" />
      </>
    )
  },
  bing: {
    color: '#2b9bda',
    icon: icon(<path d="M7 3.5l3.5 1.3v11.3l5.8-3.3-2.6-1.2-1.5-3.8L18 10v4.7l-7.5 5.8L7 18.3z" />)
  },
  startpage: {
    color: '#6573ff',
    icon: icon(
      <>
        <path d="M10.5 3.8l4.7 1.9 1.9 4.8-1.9 4.7-4.7 1.9-4.8-1.9-1.9-4.7 1.9-4.8z" />
        <path d="M15.4 15.4l4.6 4.6M10.5 7.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" />
      </>
    )
  }
}

export function EngineIcon({ id, size = 16 }: { id: string; size?: number }): React.JSX.Element {
  const mark = ENGINE_MARKS[id]
  // The user's own engines get a plain globe.
  if (!mark) return <Globe size={size} style={{ color: 'var(--text-2)' }} />
  const C = mark.icon
  return <C size={size} style={{ color: mark.color }} />
}
