import { app } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Imported first by index.ts, before anything reads the profile folder.
if (!app.isPackaged) {
  // Development uses its own profile, so it never touches (or fights over) the
  // profile of an installed Ovyra running at the same time.
  app.setPath('userData', join(app.getPath('appData'), 'Ovyra Dev'))
  // Keep painting while covered by other windows, so dev builds can be inspected.
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
}

// Heavy Mode's engine switches and the graphics card switch have to be set before Chromium
// starts, so they're read straight from the settings file (changes apply on the next start).
try {
  const saved = JSON.parse(readFileSync(join(app.getPath('userData'), 'settings.json'), 'utf8'))
  const perf = saved?.performance
  if (perf?.hardwareAcceleration === false) app.disableHardwareAcceleration()
  if (perf?.heavy) {
    const heap = Math.min(Math.max(Number(perf.pageMemoryMB) || 4096, 1024), 16384)
    app.commandLine.appendSwitch('js-flags', `--max-old-space-size=${heap}`)
    // Background windows and tabs keep full priority.
    app.commandLine.appendSwitch('disable-renderer-backgrounding')
    app.commandLine.appendSwitch('disable-background-timer-throttling')
  }
} catch {
  /* first run: no settings yet */
}
