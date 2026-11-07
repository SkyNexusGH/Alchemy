import { useEffect, useRef, useState } from 'react'

/**
 * A little game for when you're offline: a wizard runs along and jumps over potion
 * bottles. Space, ↑ or a click to jump. It speeds up as you go; your best score is kept.
 */
const W = 600
const H = 170
const GROUND = 140

interface Bottle {
  x: number
  h: number
  color: string
}

const best = (): number => {
  try {
    return Number(localStorage.getItem('alchemy-offline-best') ?? 0)
  } catch {
    return 0
  }
}

export function OfflineGame(): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [state, setState] = useState<'ready' | 'playing' | 'over'>('ready')
  const [score, setScore] = useState(0)
  const [top, setTop] = useState(best)
  const jumpRef = useRef<() => void>(() => {})

  useEffect(() => {
    const c = canvas.current!
    const ctx = c.getContext('2d')!
    const css = getComputedStyle(document.documentElement)
    const ink = css.getPropertyValue('--text').trim() || '#e6e9f0'
    const faint = css.getPropertyValue('--text-3').trim() || '#666'
    const accent = css.getPropertyValue('--accent-fg').trim() || '#ec4856'
    const colors = [accent, '#a57cf0', '#3ccf7a', '#e8b64c']

    let y = 0
    let vy = 0
    let speed = 5
    let t = 0
    let pts = 0
    let bottles: Bottle[] = []
    let running = false
    let raf = 0

    const jump = (): void => {
      if (!running) {
        // Start (or restart) on the first jump.
        running = true
        bottles = []
        speed = 5
        pts = 0
        t = 0
        y = 0
        vy = 0
        setState('playing')
        raf = requestAnimationFrame(frame)
      }
      if (y === 0) vy = 11.5
    }
    jumpRef.current = jump

    function drawWizard(): void {
      const x = 60
      const base = GROUND - y
      // robe
      ctx.fillStyle = '#6d4bc4'
      ctx.beginPath()
      ctx.moveTo(x - 12, base)
      ctx.lineTo(x + 12, base)
      ctx.lineTo(x + 6, base - 26)
      ctx.lineTo(x - 6, base - 26)
      ctx.fill()
      // face
      ctx.fillStyle = '#f2d1b3'
      ctx.beginPath()
      ctx.arc(x, base - 31, 6, 0, Math.PI * 2)
      ctx.fill()
      // hat
      ctx.fillStyle = '#4b2f99'
      ctx.beginPath()
      ctx.moveTo(x - 11, base - 34)
      ctx.lineTo(x + 11, base - 34)
      ctx.lineTo(x + 4, base - 56)
      ctx.fill()
      ctx.fillStyle = '#e8b64c'
      ctx.fillRect(x + 1, base - 50, 3, 3)
      // running legs
      ctx.strokeStyle = ink
      ctx.lineWidth = 2.5
      const step = y > 0 ? 0 : Math.sin(t / 3) * 5
      ctx.beginPath()
      ctx.moveTo(x - 4, base)
      ctx.lineTo(x - 4 + step, base + 6)
      ctx.moveTo(x + 4, base)
      ctx.lineTo(x + 4 - step, base + 6)
      ctx.stroke()
    }

    function drawBottle(b: Bottle): void {
      const top = GROUND + 6 - b.h
      ctx.fillStyle = faint
      ctx.fillRect(b.x + 6, top - 8, 8, 9)
      ctx.fillStyle = b.color
      ctx.beginPath()
      ctx.roundRect(b.x, top, 20, b.h, [4, 4, 8, 8])
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      ctx.fillRect(b.x + 4, top + 4, 3, b.h - 10)
    }

    function frame(): void {
      t++
      // physics
      vy -= 0.6
      y = Math.max(0, y + vy)
      if (y === 0) vy = 0
      // bottles
      if (!bottles.length || bottles[bottles.length - 1].x < W - (220 + Math.random() * 260)) {
        bottles.push({ x: W + 10, h: 22 + Math.random() * 22, color: colors[Math.floor(Math.random() * colors.length)] })
      }
      for (const b of bottles) b.x -= speed
      bottles = bottles.filter((b) => b.x > -30)
      speed += 0.0025
      pts += speed / 30
      // collision: the wizard's box against each bottle
      const hit = bottles.some((b) => b.x < 70 && b.x + 20 > 50 && GROUND - y > GROUND + 6 - b.h - 2)
      // draw
      ctx.clearRect(0, 0, W, H)
      ctx.strokeStyle = faint
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, GROUND + 7)
      ctx.lineTo(W, GROUND + 7)
      ctx.stroke()
      for (let i = 0; i < 12; i++) {
        const sx = (((i * 97 - t * speed * 0.4) % W) + W) % W
        ctx.fillStyle = faint
        ctx.fillRect(sx, GROUND + 14 + (i % 3) * 5, 6, 2)
      }
      for (const b of bottles) drawBottle(b)
      drawWizard()
      setScore(Math.floor(pts))
      if (hit) {
        running = false
        const final = Math.floor(pts)
        try {
          if (final > best()) localStorage.setItem('alchemy-offline-best', String(final))
        } catch {
          /* no storage */
        }
        setTop(best())
        setState('over')
        return
      }
      raf = requestAnimationFrame(frame)
    }

    // First frame: the wizard standing still.
    ctx.clearRect(0, 0, W, H)
    drawWizard()

    const onKey = (e: KeyboardEvent): void => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault()
        jump()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  return (
    <div className="offline-game">
      <canvas ref={canvas} width={W} height={H} onPointerDown={() => jumpRef.current()} />
      <div className="og-bar">
        <span>{state === 'ready' ? 'Press Space or click to play' : state === 'over' ? 'Splat! Space to try again' : 'Jump the potions'}</span>
        <span className="og-score">
          {score} {top > 0 && <em>· best {top}</em>}
        </span>
      </div>
    </div>
  )
}
