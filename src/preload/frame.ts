import { contextBridge, ipcRenderer, webFrame } from 'electron'
import { setupPopout } from './popout'
import { protect, type PrivacyConfig } from './privacy'

interface FrameConfig extends PrivacyConfig {
  popout: boolean
  scriptlets: string[]
}

// Runs in every frame of every web page, before the page's own scripts.
if (location.protocol === 'https:' || location.protocol === 'http:') {
  const config = ipcRenderer.sendSync('ovyra:frame', location.href) as FrameConfig | null

  // Ad-blocking scriptlets (uBlock's YouTube rules and friends) have to be in place before
  // the page reads its own data, so they run right now, in the page's world, past its CSP.
  for (const script of config?.scriptlets ?? []) {
    void webFrame.executeJavaScript(script).catch(() => {})
  }

  if (config && (config.farble || config.gpc)) {
    try {
      contextBridge.executeInMainWorld({ func: protect, args: [config] })
    } catch {
      /* frames without a main world (e.g. some sandboxed iframes) */
    }
  }
  if (config?.popout) setupPopout()
}
