import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Elixir, SiteRestyle } from '@shared/types'
import { api } from '../lib/api'
import { Palette, X } from '../lib/icons'
import { saveSettings, useSettings } from '../lib/settings'

interface SiteInfo {
  site: string
  restyle: SiteRestyle
  elixirs: Elixir[]
}

const FONTS = ['', 'Inter', 'Segoe UI', 'Georgia', 'Verdana', 'Comic Sans MS', 'Consolas']

/** MyHue Restyle: change how the site you're on looks. Everything applies straight away. */
export function RestylePanel(): React.JSX.Element {
  const [info, setInfo] = useState<SiteInfo | null | undefined>(undefined)
  const settings = useSettings((s) => s.settings)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => void api.invoke<SiteInfo | null>('mods:site').then(setInfo), [])
  useLayoutEffect(() => {
    if (panel.current) void api.invoke('overlay:resize', panel.current.offsetHeight + 28)
  })
  useEffect(() => {
    // Selects open native popups that take focus, so only leave once focus has really gone.
    const hide = (): void => {
      setTimeout(() => {
        if (!document.hasFocus()) void api.invoke('overlay:hide')
      }, 150)
    }
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') void api.invoke('overlay:hide')
    }
    window.addEventListener('blur', hide)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('blur', hide)
      window.removeEventListener('keydown', key)
    }
  }, [])

  if (info === undefined) return <div className="panel restyle" ref={panel} />
  if (info === null)
    return (
      <div className="panel restyle" ref={panel}>
        <div className="rs-head">
          <Palette size={18} />
          <b>MyHue Restyle</b>
        </div>
        <div className="rs-row">Open a website first, then restyle it from here.</div>
      </div>
    )

  const r = info.restyle
  const save = (patch: Partial<SiteRestyle>): void => {
    const next = { ...r, ...patch }
    setInfo({ ...info, restyle: next })
    void api.invoke('mods:setRestyle', info.site, next)
  }
  const off = settings?.forceDarkOff ?? []
  const darkHere = !!settings?.forceDark && !off.includes(info.site)

  return (
    <div className="panel restyle" ref={panel}>
      <div className="rs-head">
        <Palette size={18} />
        <div>
          <b>MyHue Restyle</b>
          <br />
          <span>{info.site}</span>
        </div>
      </div>

      <div className="rs-row">
        Force dark on this site
        <button
          type="button"
          role="switch"
          aria-checked={darkHere}
          className="switch"
          onClick={() => {
            if (darkHere) void saveSettings({ forceDarkOff: [...off, info.site] })
            else void saveSettings({ forceDark: true, forceDarkOff: off.filter((x) => x !== info.site) })
          }}
        />
      </div>

      {info.elixirs.length > 0 && (
        <>
          <div className="rs-label">Elixirs</div>
          {info.elixirs.map((e) => {
            const id = e.id
            const on = !!settings?.elixirs?.[id]
            return (
              <div className="rs-row" key={id} title={e.broken ? 'It hasn’t found anything to hide lately; the site may have changed.' : e.hint}>
                <span>
                  {e.title}
                  {e.broken && on && <span className="rs-broken">may need fixing</span>}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  className="switch"
                  onClick={() => void saveSettings({ elixirs: { ...settings?.elixirs, [id]: !on } })}
                />
              </div>
            )
          })}
        </>
      )}

      <div className="rs-row">
        Use my changes here
        <button type="button" role="switch" aria-checked={!r.paused} className="switch" title="Pause your changes without losing them" onClick={() => save({ paused: !r.paused })} />
      </div>

      <div className="rs-label">Colours</div>
      <div className="rs-colors">
        {(
          [
            ['bg', 'Background'],
            ['text', 'Text'],
            ['link', 'Links']
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="rs-color">
            <input
              type="color"
              value={r.colors?.[key] ?? (key === 'bg' ? '#ffffff' : key === 'text' ? '#222222' : '#1a5fd0')}
              onChange={(e) => save({ colors: { ...r.colors, [key]: e.target.value } })}
            />
            <span>{label}</span>
            {r.colors?.[key] && (
              <button className="icon-btn" title="The site’s own" onClick={() => save({ colors: { ...r.colors, [key]: undefined } })}>
                <X size={11} />
              </button>
            )}
          </label>
        ))}
      </div>

      <div className="rs-label">Hide parts of the page</div>
      <button className="btn small" style={{ justifySelf: 'start' }} onClick={() => void api.invoke('mods:pick')}>
        Pick something to hide
      </button>
      {r.hide.length > 0 && (
        <div className="rs-hidden">
          {r.hide.map((sel, i) => (
            <div key={sel + i}>
              <span title={sel}>{sel}</span>
              <button className="icon-btn" title="Show it again" onClick={() => save({ hide: r.hide.filter((_, j) => j !== i) })}>
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="rs-label">Text</div>
      <div className="rs-row">
        Font
        <select style={{ width: 170 }} value={r.font ?? ''} onChange={(e) => save({ font: e.target.value || undefined })}>
          {FONTS.map((f) => (
            <option key={f} value={f}>
              {f || 'The site’s own'}
            </option>
          ))}
        </select>
      </div>
      <div className="rs-row">
        Size
        <input
          type="range"
          min={80}
          max={150}
          step={5}
          value={r.fontSize ?? 100}
          onChange={(e) => {
            const v = Number(e.target.value)
            save({ fontSize: v === 100 ? undefined : v })
          }}
        />
        <span style={{ width: 38, textAlign: 'right' }}>{r.fontSize ?? 100}%</span>
      </div>

      <div className="rs-label">Your own CSS</div>
      <textarea rows={4} spellCheck={false} placeholder="a { color: hotpink !important; }" value={r.css} onChange={(e) => save({ css: e.target.value })} />
    </div>
  )
}
