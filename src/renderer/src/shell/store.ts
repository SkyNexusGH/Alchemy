import { create } from 'zustand'
import type { Bookmark, DownloadState, WindowState } from '@shared/types'
import { api } from '../lib/api'

interface ShellStore {
  win: WindowState
  bookmarks: Bookmark[]
  downloads: DownloadState[]
}

export const useShell = create<ShellStore>(() => ({
  win: {
    tabs: [],
    activeId: null,
    find: { open: false, query: '', active: 0, matches: 0 },
    fullscreen: false,
    maximized: false,
    private: false,
    workspaceId: '',
    islands: [],
    panelId: null,
    panels: [],
    split: null,
    devtools: false
  },
  bookmarks: [],
  downloads: []
}))

api.invoke<WindowState>('window:state').then((win) => win && useShell.setState({ win }))
api.on('state', (win: WindowState) => useShell.setState({ win }))
api.invoke<Bookmark[]>('bookmarks:list').then((bookmarks) => useShell.setState({ bookmarks }))
api.on('bookmarks', (bookmarks: Bookmark[]) => useShell.setState({ bookmarks }))
api.invoke<DownloadState[]>('downloads:list').then((downloads) => useShell.setState({ downloads }))
api.on('downloads', (downloads: DownloadState[]) => useShell.setState({ downloads }))

export const useActiveTab = () =>
  useShell((s) => s.win.tabs.find((t) => t.id === s.win.activeId) ?? null)
