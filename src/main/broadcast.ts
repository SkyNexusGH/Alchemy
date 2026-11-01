import { webContents } from 'electron'
import { isInternalUrl } from './protocol'

/** Sends an event to every browser-UI page: shells, overlays and open internal pages. */
export function broadcast(channel: string, ...args: unknown[]): void {
  for (const wc of webContents.getAllWebContents()) {
    if (!wc.isDestroyed() && isInternalUrl(wc.getURL())) wc.send(channel, ...args)
  }
}
