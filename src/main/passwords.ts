import { app, dialog, ipcMain, safeStorage, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SavedPassword, ToastData } from '@shared/types'
import { getSettings } from './settings'
import { BrowserWin } from './window'

/**
 * The built-in password manager. Passwords are encrypted with Windows' own data protection
 * (tied to your Windows account) and never leave the PC. Pages never see the list: the
 * picker lives in Alchemy's isolated preload, a password is handed over only for the site
 * it was saved on, and only after you pick it. Windows Hello guards filling and revealing.
 */

interface Entry extends SavedPassword {
  password: string
}

const file = (): string => join(app.getPath('userData'), 'passwords.enc')
let entries: Entry[] | null = null

function load(): Entry[] {
  if (entries) return entries
  entries = []
  try {
    if (existsSync(file()) && safeStorage.isEncryptionAvailable()) {
      entries = JSON.parse(safeStorage.decryptString(readFileSync(file()))) as Entry[]
    }
  } catch (err) {
    console.error('[passwords] could not read the password file', err)
    // Saving would replace it, so keep a copy that could still be recovered.
    copyFileSync(file(), `${file()}.unreadable-${Date.now()}`)
  }
  return entries
}

function save(): void {
  if (!safeStorage.isEncryptionAvailable()) return
  const data = safeStorage.encryptString(JSON.stringify(load()))
  writeFileSync(`${file()}.tmp`, data)
  renameSync(`${file()}.tmp`, file())
}

const originOf = (url: string): string => {
  try {
    return new URL(url).origin
  } catch {
    return ''
  }
}
const publicEntry = ({ password: _password, ...rest }: Entry): SavedPassword => rest

// ---- Windows Hello ----------------------------------------------------------------------

const HELLO = (message: string): string => `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($op, $type) { $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $task.Wait(); $task.Result }
[void][Windows.Security.Credentials.UI.UserConsentVerifier, Windows.Security.Credentials.UI, ContentType = WindowsRuntime]
$a = Await ([Windows.Security.Credentials.UI.UserConsentVerifier]::CheckAvailabilityAsync()) ([Windows.Security.Credentials.UI.UserConsentVerifierAvailability])
if ("$a" -ne 'Available') { 'Unavailable'; exit 0 }
$r = Await ([Windows.Security.Credentials.UI.UserConsentVerifier]::RequestVerificationAsync('${message.replace(/'/g, "''")}')) ([Windows.Security.Credentials.UI.UserConsentVerificationResult])
"$r"`

/** Unlocked once, the manager stays unlocked for a while, so filling doesn't nag. */
const UNLOCK_MS = 15 * 60_000
let unlockedUntil = 0
let asking: Promise<boolean> | null = null

function askHello(message: string): Promise<'Verified' | 'Unavailable' | 'Failed'> {
  return new Promise((resolve) => {
    const encoded = Buffer.from(HELLO(message), 'utf16le').toString('base64')
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded], { windowsHide: true, timeout: 120_000 }, (err, stdout) => {
      const out = String(stdout).trim().split(/\r?\n/).pop() ?? ''
      if (err) return resolve('Unavailable')
      resolve(out === 'Verified' ? 'Verified' : out === 'Unavailable' ? 'Unavailable' : 'Failed')
    })
  })
}

/** Asks you to prove it's you: Windows Hello, or a plain confirmation where Hello isn't set up. */
export function unlock(reason: string): Promise<boolean> {
  if (Date.now() < unlockedUntil) return Promise.resolve(true)
  asking ??= (async () => {
    const result = await askHello(reason)
    let ok = result === 'Verified'
    if (result === 'Unavailable') {
      const { response } = await dialog.showMessageBox({ type: 'question', message: reason, buttons: ['Continue', 'Cancel'], defaultId: 1, cancelId: 1, noLink: true })
      ok = response === 0
    }
    if (ok) unlockedUntil = Date.now() + UNLOCK_MS
    asking = null
    return ok
  })()
  return asking
}

// ---- breach checks (Have I Been Pwned's password list) --------------------------------------

/**
 * How many known breaches contain this password. Only the first 5 characters of its SHA-1
 * hash are sent; the rest is compared here, so the service never learns the password.
 */
async function breachCount(password: string): Promise<number | null> {
  const hash = createHash('sha1').update(password).digest('hex').toUpperCase()
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, { headers: { 'Add-Padding': 'true' } })
    if (!res.ok) return null
    for (const line of (await res.text()).split('\n')) {
      const [suffix, count] = line.trim().split(':')
      if (suffix === hash.slice(5)) return Number(count)
    }
    return 0
  } catch {
    return null
  }
}

async function checkEntry(e: Entry): Promise<void> {
  const n = await breachCount(e.password)
  if (n === null) return
  e.breaches = n
  e.checked = Date.now()
}

/** Checks every saved password. Returns how many were found in breaches. */
export async function checkAllBreaches(): Promise<number> {
  for (const e of load()) await checkEntry(e)
  save()
  return load().filter((e) => (e.breaches ?? 0) > 0).length
}

// ---- saving ----------------------------------------------------------------------------------

/** Logins waiting for a yes on the "Save password?" message. */
const pending = new Map<string, { origin: string; username: string; password: string }>()

export function savePending(id: string): void {
  const p = pending.get(id)
  if (!p) return
  pending.delete(id)
  upsert(p.origin, p.username, p.password)
}

function upsert(origin: string, username: string, password: string): Entry {
  const list = load()
  let e = list.find((x) => x.origin === origin && x.username === username)
  if (e) {
    e.password = password
    e.updated = Date.now()
  } else {
    e = { id: randomUUID(), origin, username, password, created: Date.now(), updated: Date.now() }
    list.push(e)
  }
  save()
  void checkEntry(e).then(() => {
    save()
    if ((e!.breaches ?? 0) > 0) {
      BrowserWin.focused()?.send('toast', { text: `This password has appeared in ${e!.breaches!.toLocaleString()} data breaches. Consider changing it.`, ms: 9000 } satisfies ToastData)
    }
  })
  return e
}

/** Only a page's top frame counts as "the site", so embedded frames can't ask for its logins. */
const isTopFrame = (event: IpcMainEvent | IpcMainInvokeEvent): boolean => !!event.senderFrame && event.senderFrame === event.sender.mainFrame

export function registerPasswordIpc(): void {
  // A login form was submitted: offer to save it (never in Masked Mode or Tor).
  ipcMain.on('ovyra:pw-captured', (event, data: { username: string; password: string }) => {
    if (!isTopFrame(event) || !getSettings().passwordManager) return
    const bw = BrowserWin.fromWebContents(event.sender)
    if (!bw || bw.incognito || !data?.password) return
    const origin = originOf(event.senderFrame!.url)
    if (!/^https?:/.test(origin)) return
    const list = load()
    const same = list.find((x) => x.origin === origin && x.username === data.username)
    if (same?.password === data.password) return
    const id = randomUUID()
    pending.set(id, { origin, username: data.username, password: data.password })
    setTimeout(() => pending.delete(id), 120_000)
    bw.send('toast', {
      text: `${same ? 'Update' : 'Save'} password for ${new URL(origin).host}?`,
      action: { label: same ? 'Update' : 'Save', cmd: 'pw-save', arg: id },
      ms: 15_000
    } satisfies ToastData)
  })

  // Which logins exist for the site you're on (names only, no passwords).
  ipcMain.handle('ovyra:pw-query', (event) => {
    if (!isTopFrame(event) || !getSettings().passwordManager || BrowserWin.fromWebContents(event.sender)?.tor) return []
    const origin = originOf(event.senderFrame!.url)
    return load()
      .filter((e) => e.origin === origin)
      .map((e) => ({ id: e.id, username: e.username }))
  })

  // You picked a login in the picker: hand over that password, for its own site only.
  ipcMain.handle('ovyra:pw-fill', async (event, id: string) => {
    if (!isTopFrame(event) || !getSettings().passwordManager || BrowserWin.fromWebContents(event.sender)?.tor) return null
    const e = load().find((x) => x.id === id)
    if (!e || e.origin !== originOf(event.senderFrame!.url)) return null
    if (!(await unlock(`Fill your password on ${new URL(e.origin).host}`))) return null
    return { username: e.username, password: e.password }
  })
}

// ---- for Settings (Alchemy's own pages only: see handle() in ipc.ts) ----------------------------

export const listPasswords = (): SavedPassword[] => load().map(publicEntry)

export async function revealPassword(id: string): Promise<string | null> {
  const e = load().find((x) => x.id === id)
  if (!e || !(await unlock('Show your saved password'))) return null
  return e.password
}

export function removePassword(id: string): void {
  entries = load().filter((e) => e.id !== id)
  save()
}

export function addPassword(url: string, username: string, password: string): void {
  const origin = originOf(/^https?:/.test(url) ? url : `https://${url}`)
  if (origin && password) upsert(origin, username, password)
}

/** Imports a CSV exported from Chrome, Edge, Brave or Opera (name, url, username, password). */
export async function importPasswordsCsv(): Promise<number> {
  const { canceled, filePaths } = await dialog.showOpenDialog({ filters: [{ name: 'Passwords CSV', extensions: ['csv'] }], properties: ['openFile'] })
  if (canceled || !filePaths[0]) return 0
  const rows = parseCsv(readFileSync(filePaths[0], 'utf8'))
  const head = (rows.shift() ?? []).map((h) => h.trim().toLowerCase())
  const [u, n, p] = ['url', 'username', 'password'].map((k) => head.indexOf(k))
  if (u < 0 || p < 0) return 0
  let count = 0
  const list = load()
  for (const row of rows) {
    const origin = originOf(row[u] ?? '')
    if (!/^https?:/.test(origin) || !row[p]) continue
    const username = n >= 0 ? (row[n] ?? '') : ''
    const e = list.find((x) => x.origin === origin && x.username === username)
    if (e) e.password = row[p]
    else list.push({ id: randomUUID(), origin, username, password: row[p], created: Date.now(), updated: Date.now() })
    count++
  }
  save()
  return count
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      cell = ''
      if (row.some(Boolean)) rows.push(row)
      row = []
    } else cell += c
  }
  row.push(cell)
  if (row.some(Boolean)) rows.push(row)
  return rows
}
