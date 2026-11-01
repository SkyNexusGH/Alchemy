/**
 * Opera-style video popout: hovering a video shows a "Pop out" pill; clicking it moves the
 * video into Chromium's floating, always-on-top Picture-in-Picture window. Lives in the
 * preload's isolated world and a closed shadow root, so pages can't see or restyle it.
 */
export function setupPopout(): void {
  if (!document.pictureInPictureEnabled) return

  let host: HTMLElement | null = null
  let button: HTMLButtonElement | null = null
  let current: HTMLVideoElement | null = null
  let hideTimer = 0
  let frame = 0

  const build = (): void => {
    host = document.createElement('ovyra-popout')
    const root = host.attachShadow({ mode: 'closed' })
    root.innerHTML = `
      <style>
        button {
          position: fixed; z-index: 2147483647; display: flex; align-items: center; gap: 7px;
          height: 32px; padding: 0 14px 0 11px; border: 0; border-radius: 999px;
          background: rgba(18, 14, 28, 0.82); color: #fff; cursor: pointer;
          font: 600 12.5px/1 system-ui, 'Segoe UI', sans-serif; letter-spacing: 0.01em;
          box-shadow: 0 6px 20px rgba(0,0,0,.35), inset 0 0 0 1px rgba(255,255,255,.14);
          backdrop-filter: blur(12px); opacity: 0; transform: translateY(-4px);
          transition: opacity .16s ease, transform .2s cubic-bezier(.2,.8,.2,1), background .12s;
          pointer-events: none;
        }
        button.show { opacity: 1; transform: none; pointer-events: auto; }
        button:hover { background: rgba(139, 92, 246, 0.92); }
        svg { width: 15px; height: 15px; }
      </style>
      <button type="button" aria-label="Pop out video">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><rect x="12" y="11" width="7" height="6" rx="1.2" fill="currentColor" stroke="none"/>
        </svg>
        <span>Pop out</span>
      </button>`
    button = root.querySelector('button')!
    button.addEventListener('pointerenter', () => window.clearTimeout(hideTimer))
    button.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const video = current
      if (!video) return
      if (document.pictureInPictureElement === video) void document.exitPictureInPicture()
      else void video.requestPictureInPicture().catch(() => {})
      hide()
    })
    document.documentElement.appendChild(host)
  }

  const eligible = (v: HTMLVideoElement): boolean => {
    const r = v.getBoundingClientRect()
    return r.width >= 240 && r.height >= 135 && v.readyState >= 1 && !v.disablePictureInPicture && !document.fullscreenElement
  }

  const place = (v: HTMLVideoElement): void => {
    if (!host || !host.isConnected) build()
    const r = v.getBoundingClientRect()
    const b = button!
    b.querySelector('span')!.textContent = document.pictureInPictureElement === v ? 'Back to tab' : 'Pop out'
    b.style.top = `${Math.max(r.top, 0) + 12}px`
    b.style.left = `${r.left + r.width / 2 - b.offsetWidth / 2}px`
    b.classList.add('show')
  }

  const hide = (): void => {
    button?.classList.remove('show')
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
