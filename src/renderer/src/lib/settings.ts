import { create } from 'zustand'
import { baseColor, THEME_PRESETS, type Settings, type ThemePreset, type Workspace } from '@shared/types'
import { api } from './api'
import { inkOn, readableOn } from './color'

interface PageContext {
  private: boolean
  workspaceId: string | null
}

export const useSettings = create<{ settings: Settings | null; context: PageContext; dark: boolean }>(() => ({
  settings: null,
  context: { private: false, workspaceId: null },
  // Windows' light/dark setting follows Ovyra's mode, so the media query is the truth.
  dark: matchMedia('(prefers-color-scheme: dark)').matches
}))

/** Accent and mode tokens for this page: the workspace's accent, or the browser's. */
function applyTheme(): void {
  const { settings, context, dark } = useSettings.getState()
  if (!settings) return
  const accent = currentWorkspace()?.accent ?? settings.appearance.accent
  const mode = settings.appearance.mode
  const base = baseColor(mode, dark)
  const root = document.documentElement
  // Dark comes in two shades: Ovyra's navy, or true black.
  root.dataset.shade = dark ? (mode === 'ovyra' ? 'ovyra' : 'black') : 'light'
  root.style.setProperty('--accent', accent)
  root.style.setProperty('--accent-ink', inkOn(accent))
  root.style.setProperty('--accent-fg', readableOn(accent, base))
  root.dataset.private = String(context.private)
  root.dataset.roundness = settings.appearance.roundness
  root.dataset.compact = String(settings.appearance.compactTabs)
  root.dataset.font = settings.appearance.font ?? 'inter'
}

export function currentWorkspace(): Workspace | undefined {
  const { settings, context } = useSettings.getState()
  return settings?.workspaces.find((w) => w.id === context.workspaceId) ?? settings?.workspaces[0]
}

export function useWorkspace(): Workspace | undefined {
  return useSettings((s) => s.settings?.workspaces.find((w) => w.id === s.context.workspaceId) ?? s.settings?.workspaces[0])
}

/** The background image URL for the new tab page (null for a plain background). */
export function backgroundUrl(settings: Settings, thumb = false): string | null {
  const a = settings.appearance
  if (a.background === 'custom') return a.customBackground ? `ovyra://assets/${a.customBackground}` : null
  const preset = THEME_PRESETS.find((p) => p.id === a.background)
  return preset?.image ? `/backgrounds/${preset.image}${thumb ? '-thumb' : ''}.jpg` : null
}

export function presetThumb(p: ThemePreset): string | null {
  return p.image ? `/backgrounds/${p.image}-thumb.jpg` : null
}

export function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  return api.invoke('settings:set', patch)
}

export function saveAppearance(patch: Partial<Settings['appearance']>): Promise<Settings> {
  const current = useSettings.getState().settings?.appearance
  return api.invoke('settings:set', { appearance: { ...current, ...patch } })
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
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  useSettings.setState({ dark: e.matches })
  applyTheme()
})
