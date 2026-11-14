import { app, powerMonitor } from 'electron'
import { askHello } from './passwords'
import { getSettings } from './settings'
import { BrowserWin } from './window'

/**
 * Lock Alchemy with Windows Hello (Settings → Passwords). It asks when Alchemy opens, and
 * again the next time you come back after the PC was locked or asleep. Until you pass,
 * Alchemy's windows stay hidden. Where Windows Hello isn't set up, it can't lock.
 */
let locked = false
let asking = false

/** Asks before the first window opens. Resolves false when Alchemy should quit. */
export async function unlockAtStart(): Promise<boolean> {
  if (!getSettings().lockWithHello) return true
  const result = await askHello('Unlock Alchemy')
  return result !== 'Failed'
}

async function unlockNow(): Promise<void> {
  if (asking) return
  asking = true
  const windows = [...BrowserWin.all].filter((w) => w.win.isVisible())
  for (const w of windows) w.win.hide()
  const result = await askHello('Unlock Alchemy')
  asking = false
  if (result === 'Failed') return app.quit()
  locked = false
  for (const w of windows) w.win.show()
}

export function initLock(): void {
  const lockSoon = (): void => {
    if (getSettings().lockWithHello) locked = true
  }
  powerMonitor.on('lock-screen', lockSoon)
  powerMonitor.on('suspend', lockSoon)
  app.on('browser-window-focus', () => {
    if (locked && getSettings().lockWithHello) void unlockNow()
  })
}
