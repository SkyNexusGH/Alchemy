import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { useShell } from './store'

export function FindBar(): React.JSX.Element {
  const find = useShell((s) => s.win.find)
  const input = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(find.query)

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
    if (text) api.invoke('find:query', text)
    return api.on('command', (cmd: string) => {
      if (cmd === 'open-find') {
        input.current?.focus()
        input.current?.select()
      }
    })
  }, [])

  const step = (forward: boolean): void => void api.invoke('find:query', text, forward, true)

  return (
    <div className="findbar">
      <div className="find-box">
        <input
          ref={input}
          value={text}
          placeholder="Find in page"
          spellCheck={false}
          onChange={(e) => {
            setText(e.target.value)
            api.invoke('find:query', e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') step(!e.shiftKey)
            if (e.key === 'Escape') api.invoke('find:close')
          }}
        />
        <span className={`find-count${text && !find.matches ? ' none' : ''}`}>
          {text ? `${find.matches ? find.active : 0}/${find.matches}` : ''}
        </span>
        <button className="icon-btn" title="Previous (Shift+Enter)" onClick={() => step(false)}>
          <ChevronUp size={16} />
        </button>
        <button className="icon-btn" title="Next (Enter)" onClick={() => step(true)}>
          <ChevronDown size={16} />
        </button>
        <button className="icon-btn" title="Close (Esc)" onClick={() => api.invoke('find:close')}>
          <X size={15} />
        </button>
      </div>
    </div>
  )
}
