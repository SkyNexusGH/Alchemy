import './welcome.css'
import { useState, type ReactNode } from 'react'
import { PANEL_PRESETS, SEARCH_ENGINES, type BuiltinEngineId, type Settings } from '@shared/types'
import { api } from '../lib/api'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  EngineIcon,
  Monitor,
  Logo as LogoMark,
  Moon,
  Search,
  Shield,
  Sidebar,
  Sparkle,
  Sun,
  Upload,
  type Icon
} from '../lib/icons'
import { AccentPicker } from '../lib/pickers'
import { backgroundUrl, saveAppearance, saveSettings, useSettings } from '../lib/settings'
import { BrandLogo, setPageIcon } from '../lib/ui'
import { ImportButtons, Segmented, ThemeGrid } from './Settings'

document.title = 'Welcome to Alchemy'
setPageIcon('<path d="M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z"/>')

interface Step {
  id: string
  icon: Icon
  title: string
  text: string
  body?: (s: Settings) => ReactNode
}

const ON = { adblock: true, blockCookieBanners: true, httpsUpgrade: true, sendGpc: true } as const

/** The first-run privacy choice is the Aegis level (#429). */
const PRIVACY_LEVELS = [
  {
    id: 'chill',
    title: 'Chill',
    text: 'Blocks ads only. Every site and login works as usual.',
    patch: { ...ON, aegisLevel: 'chill', blockThirdPartyCookies: false, fingerprintProtection: false }
  },
  {
    id: 'comfort',
    title: 'Comfort (recommended)',
    text: 'Blocks ads, trackers and cookie banners, and keeps cookies to the site you’re on.',
    patch: { ...ON, aegisLevel: 'comfort', blockThirdPartyCookies: true, fingerprintProtection: true }
  },
  {
    id: 'extreme',
    title: 'Extreme',
    text: 'Also blocks annoyances like pop-ups and chat widgets. A few sites may need Aegis turned off.',
    patch: { ...ON, aegisLevel: 'extreme', blockThirdPartyCookies: true, fingerprintProtection: true }
  },
  {
    id: 'off',
    title: 'Off',
    text: 'No blocking at all. You can turn it on later in Settings.',
    patch: { adblock: false, blockCookieBanners: false, blockThirdPartyCookies: false, fingerprintProtection: false, httpsUpgrade: false, sendGpc: false }
  }
] as const

function privacyLevel(s: Settings): string {
  return s.adblock ? (s.aegisLevel ?? 'comfort') : 'off'
}

const STEPS: Step[] = [
  {
    id: 'look',
    icon: Sparkle,
    title: 'Welcome to Alchemy',
    text: 'A fast, private browser that’s yours to shape. Start with a look and an accent color; you can change both any time.',
    body: (s) => (
      <>
        <div className="wz-center">
          <Segmented
            value={s.appearance.mode}
            onChange={(mode) => saveAppearance({ mode })}
            options={[
              { value: 'light', label: 'Light', icon: Sun },
              { value: 'alchemy', label: 'Alchemy', icon: LogoMark },
              { value: 'dark', label: 'Dark', icon: Moon },
              { value: 'system', label: 'System', icon: Monitor }
            ]}
          />
        </div>
        <ThemeGrid settings={s} />
        <div className="wz-center">
          <AccentPicker value={s.appearance.accent} onChange={(accent) => accent && saveAppearance({ accent })} size={28} />
        </div>
      </>
    )
  },
  {
    id: 'search',
    icon: Search,
    title: 'Choose a search engine',
    text: 'Used in the address bar and the new tab page. You can switch from the search box too.',
    body: (s) => (
      <div className="wz-options">
        {(Object.keys(SEARCH_ENGINES) as BuiltinEngineId[]).map((id) => (
          <OptionCard key={id} on={s.searchEngine === id} onClick={() => saveSettings({ searchEngine: id })}>
            <EngineIcon id={id} size={22} />
            <b>{SEARCH_ENGINES[id].name}</b>
          </OptionCard>
        ))}
      </div>
    )
  },
  {
    id: 'privacy',
    icon: Shield,
    title: 'How strict should Aegis be?',
    text: 'Aegis, Alchemy’s blocker, uses the same lists as uBlock Origin. You can change the level for any site later.',
    body: (s) => (
      <div className="wz-options column">
        {PRIVACY_LEVELS.map((l) => (
          <OptionCard key={l.id} on={privacyLevel(s) === l.id} onClick={() => saveSettings(l.patch)}>
            <b>{l.title}</b>
            <span>{l.text}</span>
          </OptionCard>
        ))}
      </div>
    )
  },
  {
    id: 'sidebar',
    icon: Sidebar,
    title: 'Messengers in the sidebar',
    text: 'Pin the apps you keep open. They stay logged in and show unread counts.',
    body: (s) => {
      const on = new Set(s.panels.map((p) => p.id))
      return (
        <div className="wz-options grid">
          {PANEL_PRESETS.map((p) => (
            <OptionCard
              key={p.id}
              on={on.has(p.id)}
              onClick={() =>
                saveSettings({ panels: on.has(p.id) ? s.panels.filter((x) => x.id !== p.id) : [...s.panels, p] })
              }
            >
              <span className="letter-icon" style={{ width: 28, height: 28, fontSize: 14, background: p.color }}>
                {p.title.charAt(0)}
              </span>
              <b>{p.title}</b>
            </OptionCard>
          ))}
        </div>
      )
    }
  },
  {
    id: 'import',
    icon: Upload,
    title: 'Bring your stuff over',
    text: 'Copy bookmarks, history and your Opera speed dial from browsers on this PC. Nothing is uploaded. Then you’re set: press Ctrl+K any time to search tabs and commands.',
    body: () => (
      <div className="wz-center">
        <ImportButtons />
      </div>
    )
  }
]

function OptionCard({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }): React.JSX.Element {
  return (
    <button className={`wz-option${on ? ' on' : ''}`} onClick={onClick}>
      {children}
      {on && (
        <span className="wz-check">
          <Check size={13} strokeWidth={2.8} />
        </span>
      )}
    </button>
  )
}

export default function Welcome(): React.JSX.Element {
  const settings = useSettings((s) => s.settings)
  const [index, setIndex] = useState(0)
  if (!settings) return <div className="wizard" />

  const step = STEPS[index]
  const last = index === STEPS.length - 1
  const bg = backgroundUrl(settings)
  const finish = async (): Promise<void> => {
    await saveSettings({ onboarded: true })
    void api.invoke('page:navigate', 'alchemy://newtab/')
  }

  return (
    <div className="wizard">
      {bg && <div className="wz-bg" style={{ backgroundImage: `url("${bg}")` }} />}
      <div className="wz-card" key={step.id}>
        {index === 0 ? (
          <div className="wz-hero">
            <BrandLogo size={72} />
          </div>
        ) : (
          <div className="wz-icon">
            <step.icon size={22} />
          </div>
        )}
        <h1>{step.title}</h1>
        <p className="wz-text">{step.text}</p>
        {step.body && <div className="wz-body">{step.body(settings)}</div>}

        <div className="wz-foot">
          <div className="wz-dots">
            {STEPS.map((s, i) => (
              <button key={s.id} className={i === index ? 'on' : i < index ? 'done' : ''} title={s.title} onClick={() => setIndex(i)} />
            ))}
          </div>
          <div className="wz-buttons">
            {index > 0 && (
              <button className="btn ghost" onClick={() => setIndex(index - 1)}>
                <ArrowLeft size={15} /> Back
              </button>
            )}
            {index === 0 && (
              <button className="btn ghost" onClick={finish}>
                Skip setup
              </button>
            )}
            {last ? (
              <button className="btn primary" onClick={finish}>
                Start browsing <ArrowRight size={15} />
              </button>
            ) : (
              <button className="btn primary" onClick={() => setIndex(index + 1)}>
                {index === 0 ? 'Get started' : 'Next'} <ArrowRight size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
