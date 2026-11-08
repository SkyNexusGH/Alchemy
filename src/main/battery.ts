import { powerMonitor } from 'electron'
import { broadcast } from './broadcast'
import { getSettings, onSettingsChanged } from './settings'

/**
 * Battery saver: on battery (or when switched on), background tabs sleep after 5 minutes
 * and Alchemy's own animations stop.
 */
let last = false

export function batterySaverActive(): boolean {
  const mode = getSettings().batterySaver ?? 'auto'
  return mode === 'on' || (mode === 'auto' && powerMonitor.isOnBatteryPower())
}

export function initBatterySaver(): void {
  const update = (): void => {
    const now = batterySaverActive()
    if (now === last) return
    last = now
    broadcast('battery:saver', now)
  }
  last = batterySaverActive()
  onSettingsChanged(update)
  powerMonitor.on('on-battery', update)
  powerMonitor.on('on-ac', update)
}
