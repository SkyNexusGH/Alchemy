import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown } from './icons'
import './select.css'

export interface SelectOption<T extends string | number> {
  value: T
  label: string
  hint?: string
  icon?: ReactNode
}

/**
 * Alchemy's dropdown: replaces the native <select> everywhere in the browser's own pages.
 * Opens below (or above, if there's no room), keyboard friendly, closes on outside click.
 */
export function Select<T extends string | number>({
  value,
  options,
  onChange,
  width,
  compact,
  label
}: {
  value: T
  options: SelectOption<T>[]
  onChange: (value: T) => void
  width?: number | string
  compact?: boolean
  /** Accessible name. */
  label?: string
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [above, setAbove] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    setActive(Math.max(0, options.findIndex((o) => o.value === value)))
    const close = (e: MouseEvent): void => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('blur', () => setOpen(false), { once: true })
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  useLayoutEffect(() => {
    if (!open || !root.current || !list.current) return
    const r = root.current.getBoundingClientRect()
    setAbove(r.bottom + list.current.offsetHeight + 8 > innerHeight && r.top > list.current.offsetHeight + 8)
    list.current.querySelector('.sel-opt.active')?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const pick = (o: SelectOption<T>): void => {
    onChange(o.value)
    setOpen(false)
  }

  return (
    <div className={`select${open ? ' open' : ''}${compact ? ' compact' : ''}`} ref={root} style={{ width }}>
      <button
        type="button"
        className="sel-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            if (!open) return setOpen(true)
            const n = options.length
            setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + n) % n)
          } else if (e.key === 'Enter' && open) {
            e.preventDefault()
            pick(options[active])
          } else if (e.key === 'Escape') setOpen(false)
        }}
      >
        {current?.icon && <span className="sel-icon">{current.icon}</span>}
        <span className="sel-value">{current?.label}</span>
        <ChevronDown size={15} className="sel-chevron" />
      </button>
      {open && (
        <div className={`sel-list${above ? ' above' : ''}`} ref={list} role="listbox">
          {options.map((o, i) => (
            <div
              key={String(o.value)}
              role="option"
              aria-selected={o.value === value}
              className={`sel-opt${i === active ? ' active' : ''}${o.value === value ? ' selected' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(o)
              }}
            >
              {o.icon && <span className="sel-icon">{o.icon}</span>}
              <span className="sel-text">
                {o.label}
                {o.hint && <span className="sel-hint">{o.hint}</span>}
              </span>
              {o.value === value && <Check size={14} strokeWidth={2.4} />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
