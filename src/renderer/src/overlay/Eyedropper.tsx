import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'

const ZOOM = 12
const CELLS = 11

const hex = (r: number, g: number, b: number): string => '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')

/**
 * The color picker: a still of the page fills the content area; a magnifier follows the
 * pointer and a click copies the pixel's color. Esc cancels.
 */
export function Eyedropper({ image }: { image: string }): React.JSX.Element {
  const img = useRef<HTMLImageElement>(null)
  const loupe = useRef<HTMLCanvasElement>(null)
  const pixels = useRef<CanvasRenderingContext2D | null>(null)
  const [at, setAt] = useState<{ x: number; y: number; color: string } | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') void api.invoke('overlay:hide')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onLoad = (): void => {
    const el = img.current!
    const canvas = document.createElement('canvas')
    canvas.width = el.naturalWidth
    canvas.height = el.naturalHeight
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(el, 0, 0)
    pixels.current = ctx
  }

  const onMove = (e: React.PointerEvent): void => {
    const ctx = pixels.current
    const el = img.current
    if (!ctx || !el || copied) return
    const scale = el.naturalWidth / el.clientWidth
    const px = Math.floor(e.clientX * scale)
    const py = Math.floor(e.clientY * scale)
    const [r, g, b] = ctx.getImageData(px, py, 1, 1).data
    setAt({ x: e.clientX, y: e.clientY, color: hex(r, g, b) })
    const out = loupe.current?.getContext('2d')
    if (!out) return
    out.imageSmoothingEnabled = false
    const half = Math.floor(CELLS / 2)
    out.clearRect(0, 0, CELLS * ZOOM, CELLS * ZOOM)
    out.drawImage(ctx.canvas, px - half, py - half, CELLS, CELLS, 0, 0, CELLS * ZOOM, CELLS * ZOOM)
  }

  const pick = (): void => {
    if (!at) return
    setCopied(at.color)
    setTimeout(() => void api.invoke('color:picked', at.color), 700)
  }

  const size = CELLS * ZOOM
  // Keep the magnifier on screen near the edges.
  const left = at ? (at.x + size + 40 > window.innerWidth ? at.x - size - 24 : at.x + 24) : 0
  const top = at ? (at.y + size + 70 > window.innerHeight ? at.y - size - 60 : at.y + 24) : 0

  return (
    <div className="eyedropper" onPointerMove={onMove} onClick={pick}>
      <img ref={img} src={image} onLoad={onLoad} draggable={false} alt="" />
      <div className="ed-hint">{copied ? `Copied ${copied}` : 'Click to copy a color · Esc to cancel'}</div>
      <div className="ed-loupe" style={{ left, top, visibility: at ? 'visible' : 'hidden' }}>
        <canvas ref={loupe} width={size} height={size} />
        <span className="ed-center" style={{ left: Math.floor(CELLS / 2) * ZOOM, top: Math.floor(CELLS / 2) * ZOOM, width: ZOOM, height: ZOOM }} />
        <div className="ed-value">
          <i style={{ background: at?.color }} />
          {copied ?? at?.color}
        </div>
      </div>
    </div>
  )
}
