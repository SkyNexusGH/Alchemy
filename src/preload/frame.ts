import { contextBridge, ipcRenderer } from 'electron'
import { setupPopout } from './popout'
import { protect, type PrivacyConfig } from './privacy'

// Runs in every frame of every web page, before the page's own scripts.
if (location.protocol === 'https:' || location.protocol === 'http:') {
  const config = ipcRenderer.sendSync('ovyra:frame') as (PrivacyConfig & { popout: boolean }) | null
  if (config && (config.farble || config.gpc)) {
    try {
      contextBridge.executeInMainWorld({ func: protect, args: [config] })
    } catch {
      /* frames without a main world (e.g. some sandboxed iframes) */
    }
  }
  if (config?.popout) setupPopout()
}
