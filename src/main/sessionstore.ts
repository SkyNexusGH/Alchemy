import { JsonStore } from './store'
import type { WindowSnapshot } from './window'

const store = new JsonStore<{ windows: WindowSnapshot[] }>('session', { windows: [] })
let provider: () => WindowSnapshot[] = () => []
let timer: NodeJS.Timeout | null = null
let frozen = false

export function setSessionProvider(fn: () => WindowSnapshot[]): void {
  provider = fn
}

export function loadSession(): WindowSnapshot[] {
  return Array.isArray(store.data.windows) ? store.data.windows.filter((w) => w.tabs?.length) : []
}

export function scheduleSessionSave(): void {
  if (frozen || timer) return
  timer = setTimeout(() => saveSessionNow(), 2000)
}

/** Writes the session now. `freeze` stops later saves, so windows closing during quit can't erase it. */
export function saveSessionNow(freeze = false): void {
  if (frozen) return
  if (timer) clearTimeout(timer)
  timer = null
  store.data = { windows: provider() }
  store.flush()
  if (freeze) frozen = true
}

/** A normal window opened again (e.g. from a private window after the last normal one closed). */
export function resumeSessionSaving(): void {
  frozen = false
}

export function isFrozen(): boolean {
  return frozen
}
