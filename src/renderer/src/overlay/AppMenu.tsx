import {
  AppWindow,
  Bookmark,
  Clock,
  Code,
  Columns2,
  Download,
  Expand,
  Logo as LogoMark,
  Monitor,
  Moon,
  Pipette,
  Plus,
  Printer,
  Puzzle,
  RefreshCw,
  Search,
  Settings as Gear,
  Store,
  Sun,
  TextSearch,
  VenetianMask,
  WorkspaceIcon,
  X,
  ZoomIn,
  ZoomOut,
  type Icon
} from '../lib/icons'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { AppMenuInfo, ColorMode } from '@shared/types'
import { api } from '../lib/api'
import { useSettings } from '../lib/settings'
import { BrandLogo } from '../lib/ui'

const run = (cmd: string, arg?: string, keepOpen = false): void => {
  void api.invoke('palette:run', cmd, arg)
  if (!keepOpen) void api.invoke('overlay:hide')
}

const TILES: { cmd: string; label: string; icon: Icon; hint?: string }[] = [
  { cmd: 'new-tab', label: 'New tab', icon: Plus, hint: 'Ctrl+T' },
  { cmd: 'new-window', label: 'New window', icon: AppWindow, hint: 'Ctrl+N' },
  { cmd: 'new-private', label: 'Private', icon: VenetianMask, hint: 'Ctrl+Shift+N' },
  { cmd: 'split-view', label: 'Split view', icon: Columns2 },
  { cmd: 'history', label: 'History', icon: Clock, hint: 'Ctrl+H' },
  { cmd: 'downloads', label: 'Downloads', icon: Download, hint: 'Ctrl+J' },
  { cmd: 'bookmarks', label: 'Bookmarks', icon: Bookmark, hint: 'Ctrl+Shift+O' },
  { cmd: 'extensions', label: 'Extensions', icon: Puzzle }
]

const MODES: { value: ColorMode; label: string; icon: Icon }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'ovyra', label: 'Ovyra', icon: LogoMark },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor }
]

/** The Ovyra menu, opened from the logo: quick actions, workspaces, extensions and the look. */
export function AppMenu(): React.JSX.Element {
  const [info, setInfo] = useState<AppMenuInfo | null>(null)
  const settings = useSettings((s) => s.settings)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const load = (): void => void api.invoke<AppMenuInfo>('appmenu:info').then(setInfo)
    load()
    const id = setInterval(load, 1500)
    const hide = (): void => void api.invoke('overlay:hide')
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') hide()
    }
    window.addEventListener('blur', hide)
    window.addEventListener('keydown', onKey)
    return () => {
      clearInterval(id)
      window.removeEventListener('blur', hide)
      window.removeEventListener('keydown', onKey)
    }
  }, [])
  useLayoutEffect(() => {
    if (panel.current) void api.invoke('overlay:resize', panel.current.offsetHeight + 28)
  })

  const mode = settings?.appearance.mode ?? 'ovyra'
  const zoom = async (cmd: string): Promise<void> => {
    await api.invoke('palette:run', cmd)
    setInfo(await api.invoke<AppMenuInfo>('appmenu:info'))
  }

  return (
    <div className="panel app-menu" ref={panel}>
      <div className="am-head">
        <BrandLogo size={36} />
        <div className="am-title">
          <b>Ovyra</b>
          <span>
            {info ? `Version ${info.version}` : ''}
            {info?.update.status === 'downloading' && ` · downloading update ${Math.round(info.update.percent ?? 0)}%`}
          </span>
        </div>
        <button className="am-icon" title="Command palette (Ctrl+K)" onClick={async () => {
            // The palette lives in this same overlay, so close the menu first.
            await api.invoke('overlay:hide')
            run('palette', undefined, true)
          }}>
          <Search size={17} />
        </button>
        <button className="am-icon" title="Settings" onClick={() => run('settings')}>
          <Gear size={17} />
        </button>
      </div>

      {info?.update.status === 'ready' && (
        <button className="am-update" onClick={() => run('install-update')}>
          <RefreshCw size={15} strokeWidth={2.4} />
          <span>
            Restart to update to <b>{info.update.version}</b>
          </span>
        </button>
      )}

      {!info?.private && settings && settings.workspaces.length > 1 && (
        <div className="am-workspaces">
          {settings.workspaces.map((w) => (
            <button
              key={w.id}
              className={`am-ws${w.id === info?.workspaceId ? ' on' : ''}`}
              style={w.accent ? ({ '--ws': w.accent } as React.CSSProperties) : undefined}
              onClick={() => run('workspace', w.id)}
            >
              <span className="am-ws-face">
                {w.icon ? <WorkspaceIcon id={w.icon} size={14} /> : w.name.charAt(0).toUpperCase()}
              </span>
              {w.name}
            </button>
          ))}
        </div>
      )}

      <div className="am-grid">
        {TILES.map((t) => (
          <button key={t.cmd} className="am-tile" title={t.hint ? `${t.label} (${t.hint})` : t.label} onClick={() => run(t.cmd)}>
            <t.icon size={19} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {!info?.private && (
        <div className="am-section">
          <div className="am-label">
            Extensions
            <button className="am-link" onClick={() => run('extensions')}>
              Manage
            </button>
          </div>
          <div className="am-exts">
            {info?.extensions.map((e) => (
              <button key={e.id} className="am-ext" title={e.name} onClick={() => run('extensions')}>
                {e.icon ? <img src={e.icon} alt="" /> : <Puzzle size={16} />}
              </button>
            ))}
            <button className="am-ext add" title="Get extensions from the Chrome Web Store" onClick={() => run('web-store')}>
              <Store size={16} />
              {!info?.extensions.length && <span>Get extensions</span>}
            </button>
          </div>
        </div>
      )}

      <div className="am-section">
        <div className="am-modes">
          {MODES.map((m) => (
            <button key={m.value} className={m.value === mode ? 'on' : ''} onClick={() => run('mode', m.value, true)}>
              <m.icon size={15} />
              {m.label}
            </button>
          ))}
        </div>
        <div className="am-row">
          <span className="am-row-label">Zoom</span>
          <div className="am-zoom">
            <button disabled={info?.zoom == null} title="Zoom out (Ctrl+-)" onClick={() => void zoom('zoom-out')}>
              <ZoomOut size={16} />
            </button>
            <button className="am-zoom-value" disabled={info?.zoom == null} title="Reset to 100%" onClick={() => void zoom('zoom-reset')}>
              {info?.zoom ?? 100}%
            </button>
            <button disabled={info?.zoom == null} title="Zoom in (Ctrl+=)" onClick={() => void zoom('zoom-in')}>
              <ZoomIn size={16} />
            </button>
          </div>
          <button className="am-icon" title="Full screen (F11)" onClick={() => run('fullscreen')}>
            <Expand size={16} />
          </button>
        </div>
      </div>

      <div className="am-foot">
        <button onClick={() => run('find')} title="Find in page (Ctrl+F)">
          <TextSearch size={15} /> Find
        </button>
        <button onClick={() => run('print')} title="Print (Ctrl+P)">
          <Printer size={15} /> Print
        </button>
        <button onClick={() => run('color-picker')} title="Pick a color from the page">
          <Pipette size={15} /> Color
        </button>
        <button onClick={() => run('devtools')} title="Developer tools (F12)">
          <Code size={15} /> DevTools
        </button>
        <button onClick={() => run('exit')} title="Exit Ovyra">
          <X size={15} /> Exit
        </button>
      </div>

      {info && (
        <div className="am-stats">
          {info.memoryMB.toLocaleString()} MB · {info.tabs} tab{info.tabs === 1 ? '' : 's'}
          {info.sleeping > 0 && ` (${info.sleeping} sleeping)`} · {info.blocked.toLocaleString()} blocked
        </div>
      )}
    </div>
  )
}
