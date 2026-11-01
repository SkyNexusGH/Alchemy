import { dialog, nativeImage, session, type BaseWindow, type WebContents } from 'electron'
import { join } from 'node:path'
import { ElectronChromeExtensions } from 'electron-chrome-extensions'
import { installChromeWebStore, uninstallExtension } from 'electron-chrome-web-store'
import { NEW_TAB_URL } from '@shared/types'
import { broadcast } from './broadcast'
import { tabsByContents, type Tab } from './tab'
import { BrowserWin } from './window'

/**
 * Chrome extensions in the normal (non-private) profile: installs straight from the
 * Chrome Web Store, toolbar buttons with popups, and the chrome.tabs/windows APIs mapped
 * onto Ovyra's tabs. Private windows run without extensions, like Chrome by default.
 */

let extensions: ElectronChromeExtensions | null = null

const windowOf = (win: BaseWindow): BrowserWin | undefined => [...BrowserWin.all].find((w) => w.win === win)

function ownerOf(wc: WebContents): { bw: BrowserWin; tab: Tab } | undefined {
  const tab = tabsByContents.get(wc.id)
  const bw = tab && [...BrowserWin.all].find((w) => w.tabs.includes(tab))
  return tab && bw ? { bw, tab } : undefined
}

export async function initExtensions(): Promise<void> {
  const ses = session.defaultSession
  extensions = new ElectronChromeExtensions({
    session: ses,
    async createTab(details) {
      const bw = BrowserWin.focused() ?? BrowserWin.open()
      const tab = bw.newTab(details.url ?? NEW_TAB_URL, { foreground: details.active !== false })
      tab.wake()
      return [tab.wc!, bw.win]
    },
    selectTab(wc) {
      const owner = ownerOf(wc)
      owner?.bw.activate(owner.tab)
    },
    removeTab(wc) {
      const owner = ownerOf(wc)
      owner?.bw.closeTab(owner.tab)
    },
    async createWindow(details) {
      const urls = typeof details.url === 'string' ? [details.url] : (details.url ?? [NEW_TAB_URL])
      const bw = BrowserWin.open({
        tabs: urls.map((url) => ({ url, title: '', favicon: null, pinned: false })),
        active: 0,
        incognito: details.incognito
      })
      return bw.win
    },
    removeWindow(win) {
      windowOf(win)?.win.close()
    },
    async requestPermissions(extension, permissions) {
      const list = [...(permissions.permissions ?? []), ...(permissions.origins ?? [])]
      const { response } = await dialog.showMessageBox({
        type: 'question',
        message: `“${extension.name}” is asking for more access`,
        detail: list.join('\n'),
        buttons: ['Allow', 'Deny'],
        defaultId: 1,
        cancelId: 1,
        noLink: true
      })
      return response === 0
    }
  })
  // Lets the toolbar (which lives in the default session) show extension icons.
  ElectronChromeExtensions.handleCRXProtocol(ses)

  ses.extensions.on('extension-loaded', () => broadcast('extensions', listExtensions()))
  ses.extensions.on('extension-unloaded', () => broadcast('extensions', listExtensions()))

  await installChromeWebStore({
    session: ses,
    beforeInstall: async (details) => {
      const { response } = await dialog.showMessageBox({
        type: 'question',
        message: `Add “${details.localizedName}” to Ovyra?`,
        detail: 'Extensions can read and change data on websites you visit, depending on their permissions.',
        buttons: ['Add extension', 'Cancel'],
        defaultId: 0,
        cancelId: 1,
        noLink: true
      })
      return { action: response === 0 ? 'allow' : 'deny' }
    }
  })
}

/** Called for every tab page so extensions can see it (chrome.tabs). */
export function trackTab(wc: WebContents, win: BaseWindow, incognito: boolean): void {
  if (!extensions || incognito) return
  extensions.addTab(wc, win)
}

export function selectTab(wc: WebContents | null | undefined, incognito: boolean): void {
  if (extensions && wc && !incognito) extensions.selectTab(wc)
}

/** Extension items for a page's right-click menu. */
export function extensionMenuItems(wc: WebContents, params: Electron.ContextMenuParams): Electron.MenuItem[] {
  return extensions?.getContextMenuItems(wc, params) ?? []
}

export interface ExtensionInfo {
  id: string
  name: string
  version: string
  description: string
  icon: string | null
}

export function listExtensions(): ExtensionInfo[] {
  return session.defaultSession.extensions.getAllExtensions().map((e) => {
    const icons = (e.manifest.icons ?? {}) as Record<string, string>
    const size = Object.keys(icons).map(Number).sort((a, b) => b - a)[0]
    const icon = size ? nativeImage.createFromPath(join(e.path, icons[size])) : null
    return {
      id: e.id,
      name: e.name,
      version: e.version,
      description: e.manifest.description ?? '',
      icon: icon && !icon.isEmpty() ? icon.resize({ width: 64 }).toDataURL() : null
    }
  })
}

export async function removeExtension(id: string): Promise<void> {
  await uninstallExtension(id, { session: session.defaultSession })
  broadcast('extensions', listExtensions())
}
