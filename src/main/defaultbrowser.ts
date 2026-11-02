import { app, shell } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/**
 * Lets Windows offer Alchemy as a web browser (Settings → Default apps), checks whether it's
 * the default, and opens the place to choose it. Windows doesn't let apps make themselves
 * the default, so the last step is always the user's.
 */

const PROG_ID = 'AlchemyHTML'
const CLIENT = 'Software\\Clients\\StartMenuInternet\\Alchemy'

function reg(args: string[]): Promise<string> {
  return new Promise((resolve, reject) =>
    execFile('reg.exe', args, { windowsHide: true }, (err, stdout) => (err ? reject(err) : resolve(stdout)))
  )
}

const set = (key: string, name: string | null, value: string): Promise<string> =>
  reg(['add', `HKCU\\${key}`, ...(name === null ? ['/ve'] : ['/v', name]), '/t', 'REG_SZ', '/d', value, '/f'])

/** Registers Alchemy as a browser for the current user. Installed builds only. */
export async function registerAsBrowser(): Promise<void> {
  if (!app.isPackaged || process.platform !== 'win32') return
  const exe = process.execPath
  const open = `"${exe}" "%1"`
  const icon = `"${exe}",0`
  try {
    // Alchemy used to be called Ovyra; drop that name from Windows' browser list.
    await reg(['delete', 'HKCU\\Software\\Clients\\StartMenuInternet\\Ovyra', '/f']).catch(() => '')
    await reg(['delete', 'HKCU\\Software\\Classes\\OvyraHTML', '/f']).catch(() => '')
    await reg(['delete', 'HKCU\\Software\\RegisteredApplications', '/v', 'Ovyra', '/f']).catch(() => '')
    await set(`Software\\Classes\\${PROG_ID}`, null, 'Alchemy HTML Document')
    await set(`Software\\Classes\\${PROG_ID}\\DefaultIcon`, null, icon)
    await set(`Software\\Classes\\${PROG_ID}\\shell\\open\\command`, null, open)
    await set(CLIENT, null, 'Alchemy')
    await set(`${CLIENT}\\DefaultIcon`, null, icon)
    await set(`${CLIENT}\\shell\\open\\command`, null, `"${exe}"`)
    await set(`${CLIENT}\\Capabilities`, 'ApplicationName', 'Alchemy')
    await set(`${CLIENT}\\Capabilities`, 'ApplicationDescription', 'A fast, private browser.')
    await set(`${CLIENT}\\Capabilities`, 'ApplicationIcon', icon)
    for (const scheme of ['http', 'https']) await set(`${CLIENT}\\Capabilities\\URLAssociations`, scheme, PROG_ID)
    for (const ext of ['.htm', '.html', '.svg', '.webp']) await set(`${CLIENT}\\Capabilities\\FileAssociations`, ext, PROG_ID)
    await set('Software\\RegisteredApplications', 'Alchemy', `${CLIENT}\\Capabilities`)
  } catch (err) {
    console.error('[default browser] could not register', err)
  }
}

export async function isDefaultBrowser(): Promise<boolean> {
  if (process.platform !== 'win32') return app.isDefaultProtocolClient('https')
  try {
    const out = await reg([
      'query',
      'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice',
      '/v',
      'ProgId'
    ])
    return out.includes(PROG_ID)
  } catch {
    return false
  }
}

/** Opens Windows' default apps page, on Alchemy's entry when Windows knows it. */
export function openDefaultAppsSettings(): void {
  void shell.openExternal(app.isPackaged ? 'ms-settings:defaultapps?registeredAppUser=Alchemy' : 'ms-settings:defaultapps')
}

/** A web address or an existing local file (from "Open with Alchemy") among launch arguments. */
export function urlFromArgs(argv: string[]): string | undefined {
  for (const a of argv.slice(1)) {
    if (/^https?:\/\//i.test(a)) return a
    if (/\.(html?|svg|webp|pdf)$/i.test(a) && existsSync(a)) return pathToFileURL(a).href
  }
  return undefined
}
