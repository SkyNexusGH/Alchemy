import { BrowserWindow, desktopCapturer, dialog, webContents as allContents, type Session } from 'electron'
import { isInternalUrl } from './protocol'
import { JsonStore } from './store'

/** Granted without asking: harmless, and every browser allows them. */
const ALWAYS = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock', 'keyboardLock', 'speaker-selection'])

const ASK: Record<string, string> = {
  geolocation: 'know your location',
  notifications: 'show notifications',
  'clipboard-read': 'see text and images you copy',
  midi: 'use your MIDI devices',
  midiSysex: 'use your MIDI devices',
  idleDetection: 'know when you are idle',
  'window-management': 'manage windows on all your displays',
  'storage-access': 'use cookies and site data',
  'top-level-storage-access': 'use cookies and site data'
}

const decisions = new JsonStore<Record<string, boolean>>('permissions', {})

export function originOf(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return url
  }
}

export function setupPermissions(session: Session, opts: { remember: boolean; autoAllow?: string[] }): void {
  const autoAllow = new Set(opts.autoAllow ?? [])
  // Private windows remember decisions only until private browsing ends.
  const memory: Record<string, boolean> = {}
  const saved = (): Record<string, boolean> => (opts.remember ? decisions.data : memory)

  session.setPermissionRequestHandler((wc, permission, callback, details) => {
    const url = details.requestingUrl || wc.getURL()
    if (isInternalUrl(url) || ALWAYS.has(permission) || autoAllow.has(permission)) return callback(true)

    let what = ASK[permission]
    let key: string = permission
    if (permission === 'media') {
      const types = (details as Electron.MediaAccessPermissionRequest).mediaTypes ?? []
      const cam = types.includes('video')
      const mic = types.includes('audio')
      what = cam && mic ? 'use your camera and microphone' : cam ? 'use your camera' : 'use your microphone'
      key = `media:${[...types].sort().join('+')}`
    }
    if (!what) return callback(false)

    const origin = originOf(url)
    const remembered = saved()[`${origin}|${key}`]
    if (remembered !== undefined) return callback(remembered)

    const win = BrowserWindow.getAllWindows().find((w) => w.contentView.children.some((v) => 'webContents' in v && v.webContents === wc))
    const host = new URL(origin).host || origin
    const box: Electron.MessageBoxOptions = {
      type: 'question',
      title: 'Permission request',
      message: `${host} wants to ${what}`,
      buttons: ['Allow', 'Block'],
      defaultId: 0,
      cancelId: 1,
      checkboxLabel: 'Remember my decision for this site',
      checkboxChecked: true,
      noLink: true
    }
    const shown = win ? dialog.showMessageBox(win, box) : dialog.showMessageBox(box)
    shown.then(({ response, checkboxChecked }) => {
      const allowed = response === 0
      if (checkboxChecked) {
        saved()[`${origin}|${key}`] = allowed
        if (opts.remember) decisions.save()
      }
      callback(allowed)
    })
  })

  session.setPermissionCheckHandler((_wc, permission, origin) => {
    if (isInternalUrl(origin) || ALWAYS.has(permission) || autoAllow.has(permission)) return true
    if (permission === 'media') return Object.entries(saved()).some(([k, v]) => v && k.startsWith(`${origin}|media`))
    return saved()[`${origin}|${permission}`] === true
  })

  // Screen sharing (Discord, Meet, ...): let the user pick a screen or window.
  session.setDisplayMediaRequestHandler(async (request, callback) => {
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] })
    const choices = sources.slice(0, 8)
    const owner = allContents.fromFrame?.(request.frame!) ?? null
    const win = owner ? BrowserWindow.getAllWindows().find((w) => w.contentView.children.some((v) => 'webContents' in v && v.webContents === owner)) : undefined
    const box: Electron.MessageBoxOptions = {
      type: 'question',
      title: 'Share your screen',
      message: `${new URL(request.securityOrigin).host} wants to share your screen. What should it see?`,
      buttons: [...choices.map((s) => (s.id.startsWith('screen') ? `Entire screen: ${s.name}` : s.name)), 'Cancel'],
      cancelId: choices.length,
      noLink: true
    }
    const { response } = win ? await dialog.showMessageBox(win, box) : await dialog.showMessageBox(box)
    const source = choices[response]
    if (!source) return callback({})
    callback({ video: source, audio: request.audioRequested && source.id.startsWith('screen') ? 'loopback' : undefined })
  })
}

export function clearPermissionDecisions(): void {
  decisions.data = {}
  decisions.save()
}
