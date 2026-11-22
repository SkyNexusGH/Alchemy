import './whatsnew.css'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import {
  AppWindow,
  Bookmark,
  Code,
  Columns2,
  Download,
  LayoutGrid,
  Shield,
  Gauge,
  Key,
  Keyboard,
  Layers,
  Moon,
  Palette,
  Pipette,
  Puzzle,
  Search,
  Sparkle,
  Store,
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
    version: '0.1.19',
    date: 'November 2026',
    items: [
      {
        icon: Store,
        title: 'Alchemy Extensions',
        text: 'A new store of extensions made by the Alchemy community, each one checked by hand before it’s listed. Browse it from the Extensions page or at alchemy.extensions.fivenova.org, add one in a click, and it keeps itself up to date.'
      },
      {
        icon: Puzzle,
        title: 'A new Extensions page',
        text: 'See what you have installed and where it came from, browse Alchemy Extensions by category, or head to the Chrome Web Store.'
      },
      {
        icon: Sparkle,
        title: 'Smoother everyday browsing',
        text: 'Closing a tab no longer makes the next one jump, the Alchemy menu’s tools row is back, New tab icons stay put when clicked, and address bar suggestions no longer flicker as you type.'
      }
    ]
  },
  {
    version: '0.1.18',
    date: 'November 2026',
    items: [
      {
        icon: Columns2,
        title: 'Tabs, groups and split view, reworked',
        text: 'Pull a tab off the strip to give it its own window, name your tab groups, drag the line between split pages to resize them, and choose where new tabs open. Pinned tabs no longer close with Ctrl+W, and a red dot shows which tab is using your camera or microphone.'
      },
      {
        icon: Shield,
        title: 'Aegis stops dangerous sites',
        text: 'Known malware and phishing pages now get a warning before they load. Each site can have its own blocking level, Masked Mode always uses Extreme, and the shield lets you hide anything Aegis missed, several things at a time.'
      },
      {
        icon: Key,
        title: 'Passwords, addresses and cards',
        text: 'Alchemy suggests strong passwords on sign-up forms and only offers to save after a real sign-in. It can also fill your address and payment cards, and you can lock Alchemy with Windows Hello.'
      },
      {
        icon: Bookmark,
        title: 'Later list and Reader view',
        text: 'Save pages to read later from the right-click menu, and press F9 for a clean, distraction-free Reader view. Bookmarks now have tags, Undo and import and export to a file, and History shows your most visited sites.'
      },
      {
        icon: Search,
        title: 'A smarter address bar',
        text: 'Convert currencies, check the time in any city, search just your bookmarks with @bookmarks, and get “Did you mean” for mistyped sites. Find in page now marks every match down the edge of the page.'
      },
      {
        icon: LayoutGrid,
        title: 'A calmer new tab page',
        text: 'Fewer widgets to start with, a forecast for the week, weather alerts, to-dos with due dates, your name in the greeting, a folder of your own wallpapers, and a Minimal mode.'
      },
      {
        icon: Palette,
        title: 'Site magic grows up',
        text: 'Force dark gets a schedule, brightness and contrast, and no more white flashes. There are new Elixirs for Google, Facebook, YouTube and more, which now update by themselves. Custom scripts have a proper code editor, and changes switch off instantly without a reload.'
      },
      {
        icon: Sparkle,
        title: 'Lab and Settings, tidied',
        text: 'Ask can answer about selected text and PDFs, and Voice search has push-to-talk (Ctrl+Space). Settings has a new General page, a Developer options switch, and a shorter welcome. The sidebar clock and some rarely used widgets are gone.'
      },
      {
        icon: Download,
        title: 'Safer downloads',
        text: 'Files that can run programs are checked by Microsoft Defender when they finish, downloads cut off by closing Alchemy can carry on where they stopped, and closing Alchemy mid-download asks first.'
      }
    ]
  },
  {
    version: '0.1.16',
    date: 'November 2026',
    items: [
      {
        icon: Key,
        title: 'A built-in password manager',
        text: 'Alchemy offers to save your logins, fills them after Windows Hello, and warns you if a password has appeared in a known data breach. Passwords are encrypted on your PC, and you can import them from a Chrome, Edge, Brave or Opera CSV.'
      },
      {
        icon: Palette,
        title: 'Make any site your own',
        text: 'Site magic in Settings adds Force dark, one-tap Elixirs for popular sites, MyHue Restyle for hiding parts of a page or changing its fonts, and your own custom scripts.'
      },
      {
        icon: VenetianMask,
        title: 'More private than ever',
        text: 'A permission dashboard shows every choice you’ve made for a site. Paste protection stops pages tampering with your clipboard, and each site can see a different device. Masked Mode and Tor windows also no longer send what you type in the address bar to search or weather services, and translating in a Tor window now stays on Tor.'
      },
      {
        icon: Sparkle,
        title: 'Alchemy Lab',
        text: 'A new home for experiments. Ask the page, Instant answers and Voice search all run on your PC. They start switched off and stay out of sight until you turn them on in the Lab, so if you used the microphone in the address bar, that’s where it’s gone.'
      },
      {
        icon: Search,
        title: 'Find more, faster',
        text: 'Ctrl+K now searches the words inside your open tabs and reaches far more of Alchemy, and Search everywhere runs one search in several engines side by side.'
      },
      {
        icon: Keyboard,
        title: 'Nothing hidden',
        text: 'Settings has a new Shortcuts & tips page, you can choose the language pages translate into, delete downloaded AI models from the Lab, open Alchemy Tor from the Alchemy menu, and play the potion game whenever you like.'
      },
      {
        icon: Gauge,
        title: 'Battery saver and fixes',
        text: 'On battery, background tabs sleep sooner and Alchemy’s animations stop. Closing one of three split panes now keeps the other two, and the command palette follows the window when you resize it.'
      }
    ]
  },
  {
    version: '0.1.15',
    date: 'November 2026',
    items: [
      {
        icon: AppWindow,
        title: 'Desktop sites, everywhere they belong',
        text: 'Twitch and other sites no longer open their mobile version in tabs. Sidebar sites stay mobile-sized, and you can switch any of them to the desktop version from its right-click menu.'
      }
    ]
  },
  {
    version: '0.1.14',
    date: 'November 2026',
    items: [
      {
        icon: Layers,
        title: 'Vertical tabs, Ctrl+Tab pictures',
        text: 'Tabs can run down the side, Ctrl+Tab shows your tabs as pictures, and tabs pop in, fold away and show sound bars while playing.'
      },
      {
        icon: Sparkle,
        title: 'New tab widgets',
        text: 'Weather, a daily quote, to-dos, a focus timer, now playing, news, a countdown and more. Turn them on in Settings → New Tab & Search.'
      },
      {
        icon: Search,
        title: 'A smarter address bar',
        text: 'Search by voice (Whisper, on your computer), translate pages, and get answers for sums, unit conversions and the weather.'
      },
      {
        icon: Palette,
        title: 'Mica, Acrylic, Frosted glass and runes',
        text: 'New window materials, a Monochrome theme, a site-tinted toolbar, bookmark bar styles and an optional rune icon set.'
      },
      {
        icon: Gauge,
        title: 'Aegis levels and stats',
        text: 'Chill, Comfort or Extreme protection, plus charts of what Aegis blocked, who tried to track you and what it saved.'
      },
      {
        icon: AppWindow,
        title: 'And lots more',
        text: 'A bookmarks sidebar, sidebar on the right, hover peeks, Undo toasts, a New Tor identity button, illustrated error pages and an offline game.'
      }
    ]
  },
  {
    version: '0.1.13',
    date: 'November 2026',
    items: [
      {
        icon: Sparkle,
        title: 'Meet the Aegis blocker',
        text: 'Alchemy’s ad blocker has a new name. Turn on “Count ads and trackers separately” in Settings → Aegis blocker to see the two as separate numbers.'
      },
      {
        icon: AppWindow,
        title: 'Hidden Sidebar',
        text: 'Settings → Tabs & sidebar: keep the sidebar shown, hide it until you move to the left edge, or turn it off.'
      },
      {
        icon: Gauge,
        title: 'Click again to close',
        text: 'The shield, downloads and Alchemy menu now close when you click their button a second time. The Alchemy menu is also simpler.'
      }
    ]
  },
  {
    version: '0.1.12',
    date: 'November 2026',
    items: [
      {
        icon: Layers,
        title: 'Roomier tabs',
        text: 'Tabs stay full width so titles aren’t cut off, the tab you’re on joins the toolbar, and hovering a tab shows a picture of the page.'
      },
      {
        icon: Search,
        title: 'A clearer new tab page',
        text: 'A frosted search box, bigger site icons, and the date above the clock with a greeting below.'
      },
      {
        icon: Keyboard,
        title: 'Polished menus',
        text: 'Ctrl+K dims the page and shows shortcuts as keys, the Alchemy menu has tidy icon buttons, and Alchemy Tor has its own onion icon.'
      },
      {
        icon: Palette,
        title: 'Tidier Settings',
        text: 'Centered on wide screens, a checkmark on your theme, 13 easy-to-tell-apart accent colors, and Privacy grouped into sections.'
      },
      {
        icon: VenetianMask,
        title: 'Hide your IP from Masked Mode',
        text: 'The Masked Mode page now has a “Hide my IP address” switch, and the ad-block count shows as a clear pill in the address bar.'
      }
    ]
  },
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
          {/* A timeline down the left: a version chip on each release. */}
          <h2>
            <span className="wn-chip">{r.version}</span>
            <small>{r.date}</small>
            {i === 0 && <span className="wn-new">Latest</span>}
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
