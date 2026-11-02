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
  // Each scriptlet carries its own copy of shared helpers (e.g. a JSONPath class), so each
  // runs in its own function scope, like uBlock does; sharing the page's global scope
  // makes the second one fail to redeclare them and leaves sites (YouTube) half-patched.
  const scriptlets = config?.scriptlets ?? []
  if (scriptlets.length) {
    const code = scriptlets.map((s) => `try { (function () {\n${s}\n})() } catch (e) {}`).join('\n')
    void webFrame.executeJavaScript(code).catch(() => {})
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
