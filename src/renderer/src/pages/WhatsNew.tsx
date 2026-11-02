import './whatsnew.css'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import {
  AppWindow,
  Code,
  Gauge,
  Keyboard,
  Layers,
  Moon,
  Palette,
  Pipette,
  Search,
  Sparkle,
  Volume2,
  type Icon
} from '../lib/icons'
import { BrandLogo, setPageIcon } from '../lib/ui'

document.title = 'What’s new'
setPageIcon('<path d="M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z"/>')

interface Release {
  version: string
  date: string
  items: { icon: Icon; title: string; text: string }[]
}

// Newest first. Each release adds its own entry here.
const RELEASES: Release[] = [
  {
    version: '0.1.4',
    date: 'November 2026',
    items: [
      {
        icon: Layers,
        title: 'Tab groups and multi-select',
        text: 'Ctrl+click or Shift+click to pick several tabs, then right-click → Create tab group and choose a color.'
      },
      {
        icon: Volume2,
        title: 'Tab hover cards',
        text: 'Hover a tab to see its memory use, and boost a quiet tab’s volume up to 400%.'
      },
      {
        icon: AppWindow,
        title: 'More room for pages',
        text: 'Pages now fill the window edge to edge, with a slimmer sidebar and toolbar.'
      },
      {
        icon: Moon,
        title: 'Masked Mode',
        text: 'Private windows are now Masked Mode, with a new violet look.'
      },
      {
        icon: Sparkle,
        title: 'Home zone',
        text: 'The speed dial is now the Home zone, with app-style icons that glow in each site’s colors.'
      },
      {
        icon: Search,
        title: 'Seven more search engines',
        text: 'Yahoo, Yandex, Ecosia, Qwant, Mojeek, Baidu and Kagi, plus redrawn engine icons.'
      },
      {
        icon: Gauge,
        title: 'Network limiter',
        text: 'Cap Ovyra’s bandwidth in Settings → Performance, so games and calls keep their share.'
      },
      {
        icon: Palette,
        title: 'Cleaner video bar and icons',
        text: 'A smaller video toolbar, a downloads button beside the address bar, and smoother icons throughout.'
      }
    ]
  },
  {
    version: '0.1.3',
    date: 'November 2026',
    items: [
      {
        icon: AppWindow,
        title: 'Videos that float over games',
        text: 'Pop out now opens Ovyra’s own floating player, which stays on top of borderless fullscreen games. Switch away from a playing tab and its video pops out by itself.'
      },
      {
        icon: Volume2,
        title: 'Volume boost and video screenshots',
        text: 'The video toolbar can make quiet videos up to 3× louder, and save the current frame to Pictures → Ovyra (it’s copied too).'
      },
      {
        icon: Search,
        title: 'Search shortcuts',
        text: 'Type “yt”, “w” or “gh” in the address bar and press Tab to search YouTube, Wikipedia or GitHub. Add your own in Settings → New Tab & Search.'
      },
      {
        icon: Palette,
        title: 'Fonts and 20 new workspace icons',
        text: 'Pick the interface font in Settings → Appearance: Inter, Segoe UI, Nunito, Outfit, Space Grotesk or JetBrains Mono.'
      },
      {
        icon: Code,
        title: 'JSON viewer',
        text: 'JSON files and API responses open as a tidy, foldable tree, with a raw view and Copy.'
      },
      {
        icon: Pipette,
        title: 'Color picker',
        text: 'Pick any color on a page from the Ovyra menu or the command palette (Ctrl+K). Its hex code is copied.'
      },
      {
        icon: Moon,
        title: 'Keep sites awake',
        text: 'Right-click a tab → Keep awake, so music or dashboards never go to sleep. Hover a tab to see how much memory it uses.'
      },
      {
        icon: Gauge,
        title: 'Graphics acceleration switch',
        text: 'Turn it off in Settings → Performance if videos flicker or pages show glitches.'
      },
      {
        icon: Keyboard,
        title: 'Default browser',
        text: 'Ovyra now shows up in Windows’ Default apps, so links from other apps can open here.'
      }
    ]
  },
  {
    version: '0.1.2',
    date: 'November 2026',
    items: [
      { icon: Sparkle, title: 'Video tools', text: 'Pop out, playback speed and Enhance on every video.' },
      { icon: Layers, title: 'The Ovyra menu', text: 'Click the logo for workspaces, extensions, color modes and zoom in one place.' },
      { icon: Moon, title: 'Four color modes', text: 'Light, Ovyra (navy), true-black Dark, and System.' },
      { icon: Gauge, title: 'Heavy Mode and a RAM limit', text: 'Let Ovyra use more of your computer, or keep it under a memory budget.' }
    ]
  }
]

export default function WhatsNew(): React.JSX.Element {
  const [version, setVersion] = useState('')
  useEffect(() => void api.invoke<{ version: string }>('app:info').then((i) => setVersion(i.version)), [])
  return (
    <div className="whatsnew">
      <header className="wn-head">
        <BrandLogo size={64} />
        <div>
          <h1>What’s new in Ovyra</h1>
          <p>{version ? `You’re on version ${version}.` : ''}</p>
        </div>
      </header>
      {RELEASES.map((r, i) => (
        <section key={r.version} className={`wn-release${i === 0 ? ' latest' : ''}`}>
          <h2>
            {r.version} <small>{r.date}</small>
          </h2>
          <div className="wn-grid">
            {r.items.map((item) => (
              <div key={item.title} className="wn-item">
                <span className="wn-icon">
                  <item.icon size={18} />
                </span>
                <div>
                  <b>{item.title}</b>
                  <p>{item.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
