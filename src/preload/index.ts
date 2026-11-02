import { contextBridge, ipcRenderer } from 'electron'
import { injectBrowserAction } from 'electron-chrome-extensions/browser-action'

// This preload runs in every tab, but only the browser's own pages (alchemy://) get the API.
// The main process re-checks the sender of every call.
if (location.protocol === 'alchemy:') {
  contextBridge.exposeInMainWorld('ovyra', {
    invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
    on: (channel: string, fn: (...args: unknown[]) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, ...args: unknown[]): void => fn(...args)
      ipcRenderer.on(channel, listener)
      return () => ipcRenderer.removeListener(channel, listener)
    }
  })
  // Extension toolbar buttons (<browser-action-list>) in the browser UI.
  if (location.host === 'shell') injectBrowserAction()
}
