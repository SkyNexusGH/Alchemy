import './welcome.css'
import { useState, type ReactNode } from 'react'
import { PANEL_PRESETS, SEARCH_ENGINES, type SearchEngineId, type Settings } from '@shared/types'
import { api } from '../lib/api'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  EngineIcon,
  Monitor,
  Logo as LogoMark,
  Moon,
  Palette,
  Rocket,
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

document.title = 'Welcome to Ovyra'
setPageIcon('<path d="M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z"/>')

interface Step {
  id: string
  icon: Icon
  title: string
  text: string
  body?: (s: Settings) => ReactNode
}

const PRIVACY_LEVELS = [
  {
    id: 'balanced',
    title: 'Balanced',
    text: 'Blocks ads, trackers, cookie banners and cross-site cookies. Recommended.',
    patch: { adblock: true, blockCookieBanners: true, blockThirdPartyCookies: true, fingerprintProtection: true, httpsUpgrade: true, sendGpc: true }
  },
  {
    id: 'relaxed',
    title: 'Relaxed',
    text: 'Blocks ads and trackers, but leaves cookies alone so every login works.',
    patch: { adblock: true, blockCookieBanners: true, blockThirdPartyCookies: false, fingerprintProtection: false, httpsUpgrade: true, sendGpc: true }
  },
  {
    id: 'off',
    title: 'Off',
    text: 'No blocking at all. You can turn things on later in Settings.',
    patch: { adblock: false, blockCookieBanners: false, blockThirdPartyCookies: false, fingerprintProtection: false, httpsUpgrade: false, sendGpc: false }
  }
] as const

function privacyLevel(s: Settings): string {
  if (!s.adblock) return 'off'
  return s.blockThirdPartyCookies ? 'balanced' : 'relaxed'
}

const STEPS: Step[] = [
  {
    id: 'welcome',
    icon: Sparkle,
    title: 'Welcome to Ovyra',
    text: 'A fast, private browser that’s yours to shape. Let’s set it up in a minute.'
  },
  {
    id: 'look',
    icon: Palette,
    title: 'Pick your look',
    text: 'Choose a theme and a mode: light, the Ovyra navy, or true black. You can change this any time.',
    body: (s) => (
      <>
        <div className="wz-center">
          <Segmented
            value={s.appearance.mode}
            onChange={(mode) => saveAppearance({ mode })}
            options={[
              { value: 'light', label: 'Light', icon: Sun },
              { value: 'ovyra', label: 'Ovyra', icon: LogoMark },
              { value: 'dark', label: 'Dark', icon: Moon },
              { value: 'system', label: 'System', icon: Monitor }
            ]}
          />
        </div>
        <ThemeGrid settings={s} />
      </>
    )
  },
  {
    id: 'accent',
    icon: Palette,
    title: 'Your accent color',
    text: 'Used for the active tab, highlights and buttons. Each theme comes with one; make it yours.',
    body: (s) => (
      <div className="wz-center">
        <AccentPicker value={s.appearance.accent} onChange={(accent) => accent && saveAppearance({ accent })} size={34} />
      </div>
    )
  },
  {
    id: 'search',
    icon: Search,
    title: 'Choose a search engine',
    text: 'Used in the address bar and the new tab page. You can switch from the search box too.',
    body: (s) => (
      <div className="wz-options">
        {(Object.keys(SEARCH_ENGINES) as SearchEngineId[]).map((id) => (
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
    title: 'How private?',
    text: 'Ovyra blocks ads and trackers with the same lists as uBlock Origin. Pick how strict to be.',
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
    text: 'Copy bookmarks, history and your Opera speed dial from browsers on this PC. Nothing is uploaded.',
    body: () => (
      <div className="wz-center">
        <ImportButtons />
      </div>
    )
  },
  {
    id: 'done',
    icon: Rocket,
    title: 'You’re all set',
    text: 'Press Ctrl+K any time to search tabs and commands. Right-click the sidebar to make it yours.'
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
    void api.invoke('page:navigate', 'ovyra://newtab/')
  }

  return (
    <div className="wizard">
      {bg && <div className="wz-bg" style={{ backgroundImage: `url("${bg}")` }} />}
      <div className="wz-card" key={step.id}>
        {step.id === 'welcome' || step.id === 'done' ? (
          <div className="wz-hero">
            <BrandLogo size={step.id === 'welcome' ? 104 : 80} />
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
            {index > 0 && !last && (
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
