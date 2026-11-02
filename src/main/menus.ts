import { app, clipboard, type MenuItemConstructorOptions } from 'electron'
import { NEW_TAB_URL, SEARCH_ENGINES, type AppMenuInfo } from '@shared/types'
import { children } from './bookmarks'
import { extensionMenuItems, listExtensions } from './extensions'
import { blockStats } from './privacy/shields'
import { searchUrl } from './omnibox'
import { showMenu } from './popup'
import { getSettings } from './settings'
import type { Tab } from './tab'
import { updateState } from './updater'
import { BrowserWin } from './window'

type Item = MenuItemConstructorOptions
const SEP: Item = { type: 'separator' }

function hint(accelerator: string): Pick<Item, 'accelerator' | 'registerAccelerator'> {
  // Shortcuts are handled by the window itself; menus only display them.
  return { accelerator, registerAccelerator: false }
}


export function pageContextMenu(bw: BrowserWin, tab: Tab, p: Electron.ContextMenuParams): void {
  const wc = tab.wc
  if (!wc) return
  const items: Item[] = []
  const selection = p.selectionText.trim()

  if (p.linkURL) {
    items.push(
      { label: 'Open link in new tab', click: () => bw.newTab(p.linkURL, { foreground: false, opener: tab }) },
      { label: 'Open link in new window', click: () => BrowserWin.open({ tabs: [{ url: p.linkURL, title: '', favicon: null, pinned: false }], active: 0, incognito: bw.incognito }) },
      ...(bw.incognito
        ? []
        : [{ label: 'Open link in private window', click: () => BrowserWin.open({ tabs: [{ url: p.linkURL, title: '', favicon: null, pinned: false }], active: 0, incognito: true }) }]),
      { label: 'Copy link address', click: () => clipboard.writeText(p.linkURL) },
      SEP
    )
  }
  if (p.mediaType === 'image' && p.srcURL) {
    items.push(
      { label: 'Open image in new tab', click: () => bw.newTab(p.srcURL, { foreground: false, opener: tab }) },
      { label: 'Save image as…', click: () => wc.downloadURL(p.srcURL) },
      { label: 'Copy image', click: () => wc.copyImageAt(p.x, p.y) },
      { label: 'Copy image address', click: () => clipboard.writeText(p.srcURL) },
      SEP
    )
  }
  if ((p.mediaType === 'video' || p.mediaType === 'audio') && p.srcURL && !p.srcURL.startsWith('blob:')) {
    items.push({ label: `Save ${p.mediaType} as…`, click: () => wc.downloadURL(p.srcURL) }, SEP)
  }

  if (p.isEditable) {
    if (p.misspelledWord) {
      for (const s of p.dictionarySuggestions.slice(0, 5)) items.push({ label: s, click: () => wc.replaceMisspelling(s) })
      items.push(
        { label: 'Add to dictionary', click: () => wc.session.addWordToSpellCheckerDictionary(p.misspelledWord) },
        SEP
      )
    }
    const f = p.editFlags
    items.push(
      { label: 'Undo', enabled: f.canUndo, click: () => wc.undo(), ...hint('Ctrl+Z') },
      { label: 'Redo', enabled: f.canRedo, click: () => wc.redo(), ...hint('Ctrl+Y') },
      SEP,
      { label: 'Cut', enabled: f.canCut, click: () => wc.cut(), ...hint('Ctrl+X') },
      { label: 'Copy', enabled: f.canCopy, click: () => wc.copy(), ...hint('Ctrl+C') },
      { label: 'Paste', enabled: f.canPaste, click: () => wc.paste(), ...hint('Ctrl+V') },
      { label: 'Paste as plain text', enabled: f.canPaste, click: () => wc.pasteAndMatchStyle(), ...hint('Ctrl+Shift+V') },
      { label: 'Select all', enabled: f.canSelectAll, click: () => wc.selectAll(), ...hint('Ctrl+A') },
      SEP
    )
  } else if (selection) {
    const short = selection.length > 28 ? `${selection.slice(0, 28)}…` : selection
    const engine = SEARCH_ENGINES[getSettings().searchEngine].name
    items.push(
      { label: 'Copy', click: () => wc.copy(), ...hint('Ctrl+C') },
      { label: `Search ${engine} for “${short}”`, click: () => bw.newTab(searchUrl(selection), { opener: tab }) },
      SEP
    )
  }

  if (!p.linkURL && p.mediaType === 'none' && !p.isEditable && !selection) {
    const nav = wc.navigationHistory
    items.push(
      { label: 'Back', enabled: nav.canGoBack(), click: () => nav.goBack(), ...hint('Alt+Left') },
      { label: 'Forward', enabled: nav.canGoForward(), click: () => nav.goForward(), ...hint('Alt+Right') },
      { label: 'Reload', click: () => tab.reload(), ...hint('Ctrl+R') },
      SEP,
      { label: 'Print…', click: () => wc.print(), ...hint('Ctrl+P') },
      { label: 'View page source', click: () => bw.newTab(`view-source:${tab.pageUrl()}`, { opener: tab }), ...hint('Ctrl+U') },
      SEP
    )
  }

  // Items added by extensions (chrome.contextMenus) go just above "Inspect".
  const extra = extensionMenuItems(wc, p)
  const all: (Item | Electron.MenuItem)[] = [...items, ...(extra.length ? [SEP, ...extra] : []), SEP]
  all.push({
    label: 'Inspect',
    click: () => {
      bw.openDevTools(tab)
      wc.inspectElement(p.x, p.y)
    },
    ...hint('Ctrl+Shift+I')
  })
  // The page reports where it was clicked inside itself; menus are placed in the window.
  const at = tab.view?.getBounds() ?? { x: 0, y: 0 }
  showMenu(bw, all, at.x + p.x, at.y + p.y, wc)
}

export function tabContextMenu(bw: BrowserWin, tab: Tab, x: number, y: number): void {
  const index = bw.tabs.indexOf(tab)
  const items: Item[] = [
    { label: 'New tab to the right', click: () => bw.newTab(NEW_TAB_URL, { index: index + 1 }) },
    SEP,
    { label: 'Reload', click: () => (tab.sleeping ? bw.activate(tab) : tab.reload()) },
    { label: 'Duplicate', click: () => bw.duplicate(tab) },
    bw.split?.includes(tab.id)
      ? { label: 'Exit split view', click: () => bw.unsplit() }
      : tab.id === bw.activeId
        ? { label: 'Split view with next tab', click: () => bw.splitWith(tab) }
        : { label: 'Split view with current tab', click: () => bw.active && bw.splitWith(bw.active, tab) },
    { label: tab.pinned ? 'Unpin' : 'Pin', click: () => bw.setPinned(tab, !tab.pinned) },
    { label: tab.muted ? 'Unmute site' : 'Mute site', click: () => tab.setMuted(!tab.muted) },
    {
      label: 'Put tab to sleep',
      enabled: !tab.sleeping && tab.id !== bw.activeId,
      click: () => bw.sleepTab(tab)
    },
    ...(bw.incognito
      ? []
      : [
          {
            label: 'Move to workspace',
            submenu: getSettings().workspaces.map((w) => ({
              label: `${w.icon ? `${w.icon}  ` : ''}${w.name}`,
              type: 'radio' as const,
              checked: w.id === tab.workspaceId,
              click: () => bw.moveToWorkspace(tab, w.id)
            }))
          }
        ]),
    ...(tab.islandId !== null
      ? [
          SEP,
          { label: 'Remove from island', click: () => bw.leaveIsland(tab) },
          { label: 'Close island', click: () => bw.closeIsland(tab.islandId!) }
        ]
      : []),
    SEP,
    { label: 'Close', click: () => bw.closeTab(tab), ...hint('Ctrl+W') },
    { label: 'Close other tabs', enabled: bw.tabs.length > 1, click: () => bw.closeOthers(tab) },
    { label: 'Close tabs to the right', enabled: index < bw.tabs.length - 1, click: () => bw.closeToRight(tab) },
    SEP,
    { label: 'Reopen closed tab', enabled: bw.hasClosedTabs(), click: () => bw.reopenClosed(), ...hint('Ctrl+Shift+T') }
  ]
  showMenu(bw, items, x, y)
}

/** The Ovyra menu: a panel under the logo button. */
export function appMenu(bw: BrowserWin, x: number, y: number): void {
  const width = 340
  bw.showOverlay({ x: x - 14, y: y - 6, width: width + 28, height: 640 }, { kind: 'app' }, true)
}

export function appMenuInfo(bw: BrowserWin): AppMenuInfo {
  const wc = bw.active?.wc
  const tabs = [...BrowserWin.all].flatMap((w) => w.tabs)
  const memoryKB = app.getAppMetrics().reduce((n, m) => n + m.memory.workingSetSize, 0)
  return {
    version: app.getVersion(),
    update: updateState(),
    zoom: wc ? Math.round(wc.getZoomFactor() * 100) : null,
    private: bw.incognito,
    workspaceId: bw.incognito ? null : bw.workspaceId,
    memoryMB: Math.round(memoryKB / 1024),
    tabs: tabs.length,
    sleeping: tabs.filter((t) => t.sleeping).length,
    blocked: blockStats().blocked,
    extensions: bw.incognito ? [] : listExtensions().map(({ id, name, icon }) => ({ id, name, icon }))
  }
}

export function bookmarkFolderMenu(bw: BrowserWin, folderId: string, x: number, y: number): void {
  const itemsFor = (id: string): Item[] => {
    const list = children(id)
    if (!list.length) return [{ label: '(empty)', enabled: false }]
    return list.map((b) =>
      b.type === 'folder'
        ? { label: b.title || 'Folder', submenu: itemsFor(b.id) }
        : { label: b.title || b.url!, click: () => bw.navigate(b.url!) }
    )
  }
  showMenu(bw, itemsFor(folderId), x, y)
}
