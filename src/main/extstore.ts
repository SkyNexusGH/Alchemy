import { app, dialog, net, session } from 'electron'
import AdmZip from 'adm-zip'
import { createHash, createPublicKey, verify } from 'node:crypto'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join, normalize, sep } from 'node:path'
import type { StoreExtension } from '@shared/types'
import { broadcast } from './broadcast'
import { JsonStore } from './store'

/**
 * Alchemy Extensions (alchemy.extensions.fivenova.org): extensions people publish themselves,
 * reviewed by hand before they're listed.
 *
 * Alchemy only trusts the store's list if it's signed with the store's private key; the public
 * half is built in below. Every download is checked against the SHA-256 in that signed list, so
 * nothing gets installed that the store's admin didn't approve, even if a file were swapped.
 */
export const STORE_URL = (process.env.ALCHEMY_STORE_URL ?? 'https://alchemy.extensions.fivenova.org').replace(/\/$/, '')
const PUBLIC_KEY = 'MCowBQYDK2VwAyEA1DIiEeeJI992iSY7yIYmlGqdzmPoZALmu3Nbgix6iuw='

interface Installed {
  /** Chromium's id for the loaded extension. */
  chromeId: string
  version: string
  name: string
  path: string
}

const registry = new JsonStore<{ installed: Record<string, Installed> }>('store-extensions', { installed: {} })
const root = (): string => join(app.getPath('userData'), 'StoreExtensions')

let cached: { at: number; list: StoreExtension[] } | null = null

/** The store's approved extensions, after checking the signature. */
export async function storeCatalog(force = false): Promise<StoreExtension[]> {
  if (!force && cached && Date.now() - cached.at < 5 * 60_000) return cached.list
  const res = await net.fetch(`${STORE_URL}/api/catalog`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`The store didn't answer (${res.status}).`)
  const { payload, signature } = (await res.json()) as { payload: string; signature: string }
  const key = createPublicKey({ key: Buffer.from(PUBLIC_KEY, 'base64'), format: 'der', type: 'spki' })
  if (typeof payload !== 'string' || !verify(null, Buffer.from(payload), key, Buffer.from(String(signature), 'base64'))) {
    throw new Error('The store’s list isn’t signed properly, so Alchemy won’t trust it.')
  }
  const list = (JSON.parse(payload) as { extensions: StoreExtension[] }).extensions
  cached = { at: Date.now(), list }
  return list
}

export const storeInstalled = (): Record<string, Installed> => registry.data.installed

/** Whether a loaded extension came from the Alchemy store (its store id if so). */
export const storeIdOf = (chromeId: string): string | null =>
  Object.entries(registry.data.installed).find(([, i]) => i.chromeId === chromeId)?.[0] ?? null

const newer = (a: string, b: string): boolean => {
  const x = a.split('.').map(Number)
  const y = b.split('.').map(Number)
  for (let i = 0; i < 4; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0)
  return false
}

/** Downloads a version, checks it against the signed list, and unpacks it into its own folder. */
async function fetchAndUnpack(entry: StoreExtension): Promise<string> {
  const res = await net.fetch(entry.download, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Couldn't download ${entry.name} (${res.status}).`)
  const data = Buffer.from(await res.arrayBuffer())
  if (createHash('sha256').update(data).digest('hex') !== entry.sha256) throw new Error(`${entry.name} didn't match the store's checksum, so it wasn't installed.`)
  const dir = join(root(), entry.id, entry.version)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const zip = new AdmZip(data)
  for (const item of zip.getEntries()) {
    // Never write outside the extension's own folder.
    const target = normalize(join(dir, item.entryName))
    if (!target.startsWith(dir + sep)) throw new Error('The extension’s files have unsafe paths.')
    if (item.isDirectory) mkdirSync(target, { recursive: true })
    else zip.extractEntryTo(item, dir, true, true)
  }
  if (!existsSync(join(dir, 'manifest.json'))) throw new Error('The download has no manifest.json.')
  return dir
}

/** Asks, then installs an extension from the store. */
export async function installFromStore(storeId: string, parent?: Electron.BaseWindow): Promise<'installed' | 'cancelled' | 'already'> {
  const list = await storeCatalog(true)
  const entry = list.find((e) => e.id === storeId)
  if (!entry) throw new Error('That extension isn’t in the store (any more).')
  const have = registry.data.installed[storeId]
  if (have && !newer(entry.version, have.version)) return 'already'
  const options: Electron.MessageBoxOptions = {
    type: 'question',
    message: `Add “${entry.name}” to Alchemy?`,
    detail:
      `By ${entry.author}, from Alchemy Extensions (reviewed before it was listed).\n\n` +
      (entry.permissions.length ? `It can:\n${entry.permissions.map((p) => `• ${p}`).join('\n')}` : 'It asks for no special permissions.'),
    buttons: ['Add extension', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  }
  const { response } = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options)
  if (response !== 0) return 'cancelled'
  await installEntry(entry)
  void net.fetch(`${STORE_URL}/api/extensions/${entry.id}/installed`, { method: 'POST' }).catch(() => {})
  return 'installed'
}

async function installEntry(entry: StoreExtension): Promise<void> {
  const dir = await fetchAndUnpack(entry)
  const old = registry.data.installed[entry.id]
  if (old) await session.defaultSession.extensions.removeExtension(old.chromeId)
  const loaded = await session.defaultSession.extensions.loadExtension(dir, { allowFileAccess: false })
  registry.data.installed[entry.id] = { chromeId: loaded.id, version: entry.version, name: entry.name, path: dir }
  registry.save()
  if (old && old.path !== dir) rmSync(old.path, { recursive: true, force: true })
  broadcast('store:installed', registry.data.installed)
}

export async function removeStoreExtension(storeId: string): Promise<void> {
  const have = registry.data.installed[storeId]
  if (!have) return
  await session.defaultSession.extensions.removeExtension(have.chromeId)
  rmSync(join(root(), storeId), { recursive: true, force: true })
  delete registry.data.installed[storeId]
  registry.save()
  broadcast('store:installed', registry.data.installed)
}

/** Loads installed store extensions at startup, then keeps them up to date. */
export async function initStoreExtensions(): Promise<void> {
  for (const [storeId, i] of Object.entries(registry.data.installed)) {
    try {
      const loaded = await session.defaultSession.extensions.loadExtension(i.path, { allowFileAccess: false })
      if (loaded.id !== i.chromeId) {
        i.chromeId = loaded.id
        registry.save()
      }
    } catch (err) {
      console.error('[store] could not load', storeId, err)
    }
  }
  void checkStoreUpdates()
  setInterval(() => void checkStoreUpdates(), 6 * 3600_000)
}

/** Updates store extensions to their newest approved version. Removed ones keep working. */
export async function checkStoreUpdates(): Promise<number> {
  const installed = Object.entries(registry.data.installed)
  if (!installed.length) return 0
  let list: StoreExtension[]
  try {
    list = await storeCatalog(true)
  } catch {
    return 0
  }
  let n = 0
  for (const [storeId, have] of installed) {
    const entry = list.find((e) => e.id === storeId)
    if (!entry || !newer(entry.version, have.version)) continue
    try {
      await installEntry(entry)
      n++
    } catch (err) {
      console.error('[store] update failed', storeId, err)
    }
  }
  return n
}

/** A store page link Alchemy acts on: /install/<id>. */
export function storeInstallId(url: string): string | null {
  if (!url.startsWith(`${STORE_URL}/install/`)) return null
  const id = url.slice(`${STORE_URL}/install/`.length).split(/[?#/]/)[0]
  return /^[a-z0-9-]{3,60}$/.test(id) ? id : null
}
