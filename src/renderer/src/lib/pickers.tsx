import { useRef } from 'react'
import { ACCENTS } from '@shared/types'
import { inkOn } from './color'
import { Check, Plus, WORKSPACE_ICONS } from './icons'
import './pickers.css'

/** The accent palette, plus a swatch that opens a full color picker. */
export function AccentPicker({
  value,
  onChange,
  allowDefault,
  size = 26
}: {
  value: string | null
  onChange: (accent: string | null) => void
  /** Offer a "same as browser" choice (for workspaces). */
  allowDefault?: boolean
  size?: number
}): React.JSX.Element {
  const custom = useRef<HTMLInputElement>(null)
  const isCustom = value !== null && !ACCENTS.includes(value.toLowerCase())
  return (
    <div className="accent-picker" style={{ '--sw': `${size}px` } as React.CSSProperties}>
      {allowDefault && (
        <button
          type="button"
          className={`swatch default${value === null ? ' on' : ''}`}
          title="Same as the browser accent"
          onClick={() => onChange(null)}
        >
          A
        </button>
      )}
      {ACCENTS.map((c) => (
        <button
          type="button"
          key={c}
          className={`swatch${value?.toLowerCase() === c ? ' on' : ''}`}
          title={c}
          style={{ background: c, color: inkOn(c) }}
          onClick={() => onChange(c)}
        >
          {value?.toLowerCase() === c && <Check size={size * 0.55} strokeWidth={2.6} />}
        </button>
      ))}
      <button
        type="button"
        className={`swatch custom${isCustom ? ' on' : ''}`}
        title="Pick any color"
        style={isCustom ? { background: value!, color: inkOn(value!) } : undefined}
        onClick={() => custom.current?.click()}
      >
        {isCustom ? <Check size={size * 0.55} strokeWidth={2.6} /> : <Plus size={size * 0.55} />}
      </button>
      <input
        ref={custom}
        type="color"
        className="color-input"
        value={value ?? '#ec4856'}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

/** Ovyra's workspace icons, plus "first letter of the name". */
export function WorkspaceIconPicker({
  value,
  name,
  onChange
}: {
  value: string
  name: string
  onChange: (icon: string) => void
}): React.JSX.Element {
  return (
    <div className="icon-picker">
      <button type="button" className={value === '' ? 'on' : ''} title="First letter" onClick={() => onChange('')}>
        <span className="letter">{(name || 'W').charAt(0).toUpperCase()}</span>
      </button>
      {Object.entries(WORKSPACE_ICONS).map(([id, { label, icon: Icon }]) => (
        <button type="button" key={id} className={value === id ? 'on' : ''} title={label} onClick={() => onChange(id)}>
          <Icon size={17} />
        </button>
      ))}
    </div>
  )
}
