/**
 * Click ripples: a soft circle spreads from where you press a button. One listener for the
 * whole page, so every button gets it without changes to each component.
 */
const SELECTOR = '.btn, .icon-btn, .am-tile, .am-foot button, .rail-btn, .set-cat, .segmented button, .tile-icon'

document.addEventListener(
  'pointerdown',
  (e) => {
    if (e.button !== 0 || document.documentElement.dataset.motion === 'reduced') return
    const host = (e.target as HTMLElement | null)?.closest<HTMLElement>(SELECTOR)
    if (!host || (host as HTMLButtonElement).disabled) return
    const r = host.getBoundingClientRect()
    const size = Math.max(r.width, r.height) * 2.2
    const dot = document.createElement('span')
    dot.className = 'ripple'
    dot.style.width = dot.style.height = `${size}px`
    dot.style.left = `${e.clientX - r.left - size / 2}px`
    dot.style.top = `${e.clientY - r.top - size / 2}px`
    host.classList.add('ripple-host')
    host.appendChild(dot)
    dot.addEventListener('animationend', () => dot.remove())
  },
  { passive: true }
)
