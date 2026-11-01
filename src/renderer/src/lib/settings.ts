import { create } from 'zustand'
import { THEMES, type Settings, type Workspace } from '@shared/types'
import { api } from './api'

interface PageContext {
  private: boolean
  workspaceId: string | null
}

export const useSettings = create<{ settings: Settings | null; context: PageContext }>(() => ({
  settings: null,
  context: { private: false, workspaceId: null }
}))

/** Colors come from the workspace this page's window is showing. */
function applyTheme(): void {
  const { settings, context } = useSettings.getState()
  if (!settings) return
  const theme = THEMES.find((t) => t.id === currentWorkspace()?.theme) ?? THEMES[0]
  const root = document.documentElement.style
  root.setProperty('--a', theme.a)
  root.setProperty('--b', theme.b)
  document.documentElement.dataset.private = String(context.private)
}

export function currentWorkspace(): Workspace | undefined {
  const { settings, context } = useSettings.getState()
  return settings?.workspaces.find((w) => w.id === context.workspaceId) ?? settings?.workspaces[0]
}

export function useWorkspace(): Workspace | undefined {
  return useSettings((s) => s.settings?.workspaces.find((w) => w.id === s.context.workspaceId) ?? s.settings?.workspaces[0])
}

export function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  return api.invoke('settings:set', patch)
}

const setSettings = (settings: Settings): void => {
  useSettings.setState({ settings })
  applyTheme()
}
const setContext = (context: PageContext): void => {
  if (!context) return
  useSettings.setState({ context })
  applyTheme()
}

api.invoke<Settings>('settings:get').then(setSettings)
api.on('settings', setSettings)
api.invoke<PageContext>('page:context').then(setContext)
api.on('context', setContext)
