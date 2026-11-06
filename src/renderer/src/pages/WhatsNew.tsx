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
  VenetianMask,
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
    version: '0.1.11',
    date: 'November 2026',
    items: [
      {
        icon: Sparkle,
        title: 'Updates arrive sooner',
        text: 'Alchemy checks for updates every hour, and again when you come back to it, so new versions show up within minutes instead of hours.'
      }
    ]
  },
  {
    version: '0.1.10',
    date: 'November 2026',
    items: [
      {
        icon: VenetianMask,
        title: 'Hide my IP in Masked Mode',
        text: 'Turn it on in Settings → Privacy and every Masked Mode window goes through Tor, so sites can’t see your real IP address.'
      }
    ]
  },
  {
    version: '0.1.9',
    date: 'November 2026',
    items: [
      {
        icon: Moon,
        title: 'Alchemy Tor',
        text: 'A Masked Mode window that goes through the Tor network, so sites can’t see your real IP address. Open one from Settings → Privacy, Ctrl+K, or by right-clicking a link. Free, built in, no account.'
      },
      {
        icon: Gauge,
        title: 'Works where Tor is blocked',
        text: 'If your network blocks Tor, Alchemy connects through Snowflake bridges by itself.'
      }
    ]
  },
  {
    version: '0.1.8',
    date: 'November 2026',
    items: [
      {
        icon: AppWindow,
        title: 'A better floating player',
        text: 'Make it see-through so it doesn’t hide your HUD, let clicks pass through it to your game, and it now remembers its size, place and monitor.'
      },
      {
        icon: Volume2,
        title: 'Bass, Spatial and Mono',
        text: 'Hover a playing tab for bass boost, a wider spatial sound, or mono for one earbud, next to the volume boost.'
      },
      {
        icon: Palette,
        title: 'Clock styles and high contrast',
        text: 'Pick a classic, bold, analog or in-words clock for the new tab page, and turn on High contrast in Appearance.'
      },
      {
        icon: Gauge,
        title: 'Crypto miners blocked',
        text: 'Pages that secretly mine cryptocurrency with your CPU are now stopped too.'
      }
    ]
  },
  {
    version: '0.1.6',
    date: 'November 2026',
    items: [
      {
        icon: Code,
        title: 'Now GPL-3.0',
        text: 'Alchemy is free software under the GNU GPL v3: free to use, study, change and share, as long as changed versions stay open. Created by SkyNexusHD (SNHD) and FiveNova.'
      },
      {
        icon: Layers,
        title: 'Sidebar icons fixed',
        text: 'Sites like Discord now show their real icon in the sidebar instead of a letter.'
      }
    ]
  },
  {
    version: '0.1.5',
    date: 'November 2026',
    items: [
      {
        icon: Sparkle,
        title: 'Ovyra is now Alchemy',
        text: 'A new name and a new logo. The icon in the browser takes on your accent color. Your settings, tabs and logins all came along.'
      },
      {
        icon: Moon,
        title: 'A new Masked Mode',
        text: 'Graphite and brushed silver, with a masquerade-mask background on the new tab page.'
      }
    ]
  },
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
        text: 'Cap Alchemy’s bandwidth in Settings → Performance, so games and calls keep their share.'
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
        text: 'Pop out now opens Alchemy’s own floating player, which stays on top of borderless fullscreen games. Switch away from a playing tab and its video pops out by itself.'
      },
      {
        icon: Volume2,
        title: 'Volume boost and video screenshots',
        text: 'The video toolbar can make quiet videos up to 3× louder, and save the current frame to Pictures → Alchemy (it’s copied too).'
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
        text: 'Pick any color on a page from the Alchemy menu or the command palette (Ctrl+K). Its hex code is copied.'
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
        text: 'Alchemy now shows up in Windows’ Default apps, so links from other apps can open here.'
      }
    ]
  },
  {
    version: '0.1.2',
    date: 'November 2026',
    items: [
      { icon: Sparkle, title: 'Video tools', text: 'Pop out, playback speed and Enhance on every video.' },
      { icon: Layers, title: 'The Alchemy menu', text: 'Click the logo for workspaces, extensions, color modes and zoom in one place.' },
      { icon: Moon, title: 'Four color modes', text: 'Light, Alchemy (navy), true-black Dark, and System.' },
      { icon: Gauge, title: 'Heavy Mode and a RAM limit', text: 'Let Alchemy use more of your computer, or keep it under a memory budget.' }
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
          <h1>What’s new in Alchemy</h1>
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
