/**
 * Ovyra's video toolbar: hovering a video shows a small pill with Pop out (floating
 * Picture-in-Picture), playback speed and Enhance (crisper contrast and color). Lives in
 * the preload's isolated world inside a closed shadow root, so pages can't see or
 * restyle it. Built with plain DOM calls: sites like YouTube enforce Trusted Types,
 * which forbids building HTML from strings.
 */

const SPEEDS = [1, 1.25, 1.5, 2, 0.75]
// Subtle "enhance": a touch more contrast and color, like TV picture modes.
const ENHANCE_FILTER = 'contrast(1.08) saturate(1.18) brightness(1.02)'
const SVG_NS = 'http://www.w3.org/2000/svg'

function svgIcon(paths: { d: string; fill?: boolean }[]): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2.2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  for (const p of paths) {
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', p.d)
    if (p.fill) {
      path.setAttribute('fill', 'currentColor')
      path.setAttribute('stroke', 'none')
    }
    svg.appendChild(path)
  }
  return svg
}

const CSS = `
  .bar {
    position: fixed; z-index: 2147483647; display: flex; align-items: center; gap: 2px;
    height: 34px; padding: 3px; border-radius: 999px;
    background: rgba(9, 14, 23, 0.86); color: #fff;
    font: 600 12.5px/1 system-ui, 'Segoe UI', sans-serif;
    box-shadow: 0 6px 20px rgba(0,0,0,.35), inset 0 0 0 1px rgba(255,255,255,.12);
    opacity: 0; transform: translateY(-4px); pointer-events: none;
    transition: opacity .16s ease, transform .2s cubic-bezier(.2,.8,.2,1);
  }
  .bar.show { opacity: 1; transform: none; pointer-events: auto; }
  button {
    display: flex; align-items: center; gap: 6px; height: 28px; padding: 0 11px;
    border: 0; border-radius: 999px; background: transparent; color: inherit;
    font: inherit; cursor: pointer; transition: background .12s;
  }
  button:hover { background: rgba(255,255,255,.14); }
  button.on { background: #ec4856; }
  .sep { width: 1px; height: 16px; background: rgba(255,255,255,.18); }
  svg { width: 15px; height: 15px; }
`

export function setupPopout(): void {
  if (!document.pictureInPictureEnabled) return

  let host: HTMLElement | null = null
  let bar: HTMLDivElement | null = null
  let popBtn: HTMLButtonElement | null = null
  let speedBtn: HTMLButtonElement | null = null
  let enhanceBtn: HTMLButtonElement | null = null
  let current: HTMLVideoElement | null = null
  let hideTimer = 0
  let frame = 0
  const enhanced = new WeakSet<HTMLVideoElement>()

  const makeButton = (label: string, title: string, icon?: SVGSVGElement): HTMLButtonElement => {
    const b = document.createElement('button')
    b.type = 'button'
    b.title = title
    if (icon) b.appendChild(icon)
    const span = document.createElement('span')
    span.textContent = label
    b.appendChild(span)
    b.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
    })
    return b
  }
  const setLabel = (b: HTMLButtonElement, text: string): void => {
    b.querySelector('span')!.textContent = text
  }

  const build = (): void => {
    host = document.createElement('ovyra-video-tools')
    const root = host.attachShadow({ mode: 'closed' })
    const style = document.createElement('style')
    style.textContent = CSS
    bar = document.createElement('div')
    bar.className = 'bar'

    popBtn = makeButton(
      'Pop out',
      'Float this video above other windows',
      svgIcon([{ d: 'M2.5 4.5h19v15h-19z' }, { d: 'M12 11h7v6h-7z', fill: true }])
    )
    popBtn.addEventListener('click', () => {
      const v = current
      if (!v) return
      if (document.pictureInPictureElement === v) void document.exitPictureInPicture()
      else void v.requestPictureInPicture().catch(() => {})
    })

    speedBtn = makeButton('1×', 'Playback speed')
    speedBtn.addEventListener('click', () => {
      const v = current
      if (!v) return
      const i = SPEEDS.indexOf(v.playbackRate)
      v.playbackRate = SPEEDS[(i + 1) % SPEEDS.length]
      refresh()
    })

    enhanceBtn = makeButton('Enhance', 'Crisper contrast and richer color', svgIcon([{ d: 'M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z' }]))
    enhanceBtn.addEventListener('click', () => {
      const v = current
      if (!v) return
      if (enhanced.has(v)) {
        enhanced.delete(v)
        v.style.filter = ''
      } else {
        enhanced.add(v)
        v.style.filter = ENHANCE_FILTER
      }
      refresh()
    })

    const sep = (): HTMLDivElement => Object.assign(document.createElement('div'), { className: 'sep' })
    bar.append(popBtn, sep(), speedBtn, sep(), enhanceBtn)
    bar.addEventListener('pointerenter', () => window.clearTimeout(hideTimer))
    root.append(style, bar)
    document.documentElement.appendChild(host)
  }

  const refresh = (): void => {
    const v = current
    if (!v || !popBtn || !speedBtn || !enhanceBtn) return
    setLabel(popBtn, document.pictureInPictureElement === v ? 'Back to tab' : 'Pop out')
    setLabel(speedBtn, `${v.playbackRate}×`)
    enhanceBtn.classList.toggle('on', enhanced.has(v))
  }

  const eligible = (v: HTMLVideoElement): boolean => {
    const r = v.getBoundingClientRect()
    return r.width >= 240 && r.height >= 135 && v.readyState >= 1 && !v.disablePictureInPicture && !document.fullscreenElement
  }

  const place = (v: HTMLVideoElement): void => {
    if (!host || !host.isConnected) build()
    refresh()
    const r = v.getBoundingClientRect()
    const b = bar!
    b.style.top = `${Math.max(r.top, 0) + 12}px`
    b.style.left = `${r.left + r.width / 2 - b.offsetWidth / 2}px`
    b.classList.add('show')
  }

  const hide = (): void => {
    bar?.classList.remove('show')
    current = null
  }

  const videoAt = (x: number, y: number): HTMLVideoElement | null => {
    // Players put controls and overlays on top of the <video>; look underneath them.
    for (const el of document.elementsFromPoint(x, y)) {
      if (el instanceof HTMLVideoElement) return el
      if (el === host) return current
    }
    return null
  }

  document.addEventListener(
    'pointermove',
    (e) => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        if (!document.querySelector('video')) return
        const v = videoAt(e.clientX, e.clientY)
        if (v && eligible(v)) {
          window.clearTimeout(hideTimer)
          current = v
          place(v)
        } else if (current) {
          window.clearTimeout(hideTimer)
          hideTimer = window.setTimeout(hide, 900)
        }
      })
    },
    { passive: true, capture: true }
  )
  document.addEventListener('scroll', () => current && place(current), { passive: true, capture: true })
}
