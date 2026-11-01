import { useLayoutEffect } from 'react'
import { api } from '../lib/api'

/** Native views (the page, the side panel) are laid exactly over placeholders like this one. */
export function useReportRect(ref: React.RefObject<HTMLElement | null>, channel: string): void {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const report = (): void => {
      const r = el.getBoundingClientRect()
      api.invoke(channel, { x: r.left, y: r.top, width: r.width, height: r.height })
    }
    const ro = new ResizeObserver(report)
    ro.observe(el)
    window.addEventListener('resize', report)
    report()
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', report)
    }
  }, [ref, channel])
}
