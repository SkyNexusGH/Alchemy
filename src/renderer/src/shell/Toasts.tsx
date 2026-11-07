import { useEffect, useRef, useState } from 'react'
import type { ToastData } from '@shared/types'
import { api } from '../lib/api'

interface Shown extends ToastData {
  key: number
}

let nextKey = 1

/**
 * Small messages in the title bar ("Tab closed · Undo"), plus a gold one with confetti
 * when the Aegis blocker passes a milestone. They leave on their own after a few seconds.
 */
export function Toasts(): React.JSX.Element {
  const [list, setList] = useState<Shown[]>([])
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const show = (t: ToastData): void => {
      const key = nextKey++
      // Only the newest couple stay, so a burst of actions doesn't stack up.
      setList((l) => [...l.slice(-1), { ...t, key }])
      timers.current.set(
        key,
        setTimeout(() => dismiss(key), t.kind === 'gold' ? 6500 : 4500)
      )
    }
    const offToast = api.on('toast', show)
    const offMilestone = api.on('aegis:milestone', (n: number) =>
      show({ text: `${n.toLocaleString()} ads & trackers blocked`, kind: 'gold' })
    )
    return () => {
      offToast()
      offMilestone()
    }
  }, [])

  function dismiss(key: number): void {
    clearTimeout(timers.current.get(key))
    timers.current.delete(key)
    setList((l) => l.filter((t) => t.key !== key))
  }

  return (
    <div className="toasts" aria-live="polite">
      {list.map((t) => (
        <div key={t.key} className={`toast${t.kind === 'gold' ? ' gold' : ''}`}>
          {t.kind === 'gold' && (
            <span className="confetti" aria-hidden>
              {Array.from({ length: 14 }, (_, i) => (
                <i key={i} style={{ '--a': `${(i / 14) * 360}deg`, '--d': `${18 + (i % 3) * 8}px` } as React.CSSProperties} />
              ))}
            </span>
          )}
          <span className="toast-text">{t.text}</span>
          {t.action && (
            <button
              className="toast-action"
              onClick={() => {
                void api.invoke('palette:run', t.action!.cmd, t.action!.arg)
                dismiss(t.key)
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
