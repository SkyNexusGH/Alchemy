import { app, clipboard, dialog, ipcMain, safeStorage, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { execFile } from 'node:child_process'
import { createHash, randomInt, randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SavedPassword, ToastData } from '@shared/types'
import { getSettings, updateSettings } from './settings'
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

/** Windows can't encrypt right now, so passwords are kept only until Alchemy closes. */
let unencrypted = false
let loading: Promise<void> | null = null

/** Reads the password file once, at startup. */
export function loadPasswords(): Promise<void> {
  return (loading ??= (async () => {
    const list: Entry[] = []
    try {
      if (!(await safeStorage.isAsyncEncryptionAvailable())) {
        unencrypted = true
      } else if (existsSync(file())) {
        const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(readFileSync(file()))
        list.push(...(JSON.parse(result) as Entry[]))
        if (shouldReEncrypt) setTimeout(save)
      }
    } catch (err) {
      console.error('[passwords] could not read the password file', err)
      // Saving would replace it, so keep a copy that could still be recovered.
      copyFileSync(file(), `${file()}.unreadable-${Date.now()}`)
    }
    // Anything saved while the file was still being read is kept too.
    entries = [...list, ...(entries ?? []).filter((e) => !list.some((x) => x.id === e.id))]
  })())
}

function load(): Entry[] {
  return (entries ??= [])
}

let writing = Promise.resolve()

function save(): void {
  writing = writing
    .then(() => loadPasswords())
    .then(async () => {
      if (unencrypted) return
      const data = await safeStorage.encryptStringAsync(JSON.stringify(load()))
      writeFileSync(`${file()}.tmp`, data)
      renameSync(`${file()}.tmp`, file())
    })
    .catch((err) => console.error('[passwords] could not save', err))
}

/** Whether saved passwords survive a restart (false when Windows encryption isn't available). */
export const passwordsEncrypted = (): boolean => !unencrypted

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

export function askHello(message: string): Promise<'Verified' | 'Unavailable' | 'Failed'> {
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
  if (unencrypted) {
    BrowserWin.focused()?.send('toast', { text: 'Windows can’t encrypt passwords on this PC right now, so this one is kept only until you close Alchemy.', ms: 9000 } satisfies ToastData)
  }
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
  void loadPasswords()
  // A login form was submitted: offer to save it (never in Masked Mode or Tor).
  ipcMain.on('alchemy:pw-captured', (event, data: { username: string; password: string }) => {
    if (!isTopFrame(event) || !getSettings().passwordManager) return
    const bw = BrowserWin.fromWebContents(event.sender)
    if (!bw || bw.incognito || !data?.password) return
    const origin = originOf(event.senderFrame!.url)
    if (!/^https?:/.test(origin) || (getSettings().pwNever ?? []).includes(origin)) return
    const list = load()
    const same = list.find((x) => x.origin === origin && x.username === data.username)
    if (same?.password === data.password) return
    const id = randomUUID()
    pending.set(id, { origin, username: data.username, password: data.password })
    setTimeout(() => pending.delete(id), 120_000)
    bw.send('toast', {
      text: `${same ? 'Update' : 'Save'} password for ${new URL(origin).host}?`,
      action: { label: same ? 'Update' : 'Save', cmd: 'pw-save', arg: id },
      action2: same ? undefined : { label: 'Never for this site', cmd: 'pw-never', arg: origin },
      ms: 15_000
    } satisfies ToastData)
  })

  // A sign-up form wants a new password: suggest a strong one.
  ipcMain.handle('alchemy:pw-generate', (event) => {
    if (!isTopFrame(event) || !getSettings().passwordManager || BrowserWin.fromWebContents(event.sender)?.incognito) return null
    return generatePassword()
  })

  // Which logins exist for the site you're on (names only, no passwords).
  ipcMain.handle('alchemy:pw-query', (event) => {
    if (!isTopFrame(event) || !getSettings().passwordManager || BrowserWin.fromWebContents(event.sender)?.tor) return []
    const origin = originOf(event.senderFrame!.url)
    return load()
      .filter((e) => e.origin === origin)
      .map((e) => ({ id: e.id, username: e.username }))
  })

  // You picked a login in the picker: hand over that password, for its own site only.
  ipcMain.handle('alchemy:pw-fill', async (event, id: string) => {
    if (!isTopFrame(event) || !getSettings().passwordManager || BrowserWin.fromWebContents(event.sender)?.tor) return null
    const e = load().find((x) => x.id === id)
    if (!e || e.origin !== originOf(event.senderFrame!.url)) return null
    if (!(await unlock(`Fill your password on ${new URL(e.origin).host}`))) return null
    return { username: e.username, password: e.password }
  })
}

// ---- strong passwords ------------------------------------------------------------------------

/** A random password from Settings' options: length, symbols, and no look-alike letters. */
export function generatePassword(opts = getSettings().pwGenerator ?? { length: 20, symbols: true, readable: true }): string {
  const lookAlike = /[Il1O0o]/g
  let lower = 'abcdefghijklmnopqrstuvwxyz'
  let upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let digits = '0123456789'
  const symbols = '!@#$%^&*-_=+?'
  if (opts.readable) {
    lower = lower.replace(lookAlike, '')
    upper = upper.replace(lookAlike, '')
    digits = digits.replace(lookAlike, '')
  }
  const sets = [lower, upper, digits, ...(opts.symbols ? [symbols] : [])]
  const all = sets.join('')
  const length = Math.min(64, Math.max(8, Math.round(opts.length) || 20))
  // One from each kind, so sites that demand a digit or a symbol are happy; the rest at random.
  const chars = sets.map((s) => s[randomInt(s.length)])
  while (chars.length < length) chars.push(all[randomInt(all.length)])
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

/** Never offer to save passwords on this site (from the save prompt). */
export function neverSaveFor(origin: string): void {
  const list = getSettings().pwNever ?? []
  if (/^https?:/.test(origin) && !list.includes(origin)) updateSettings({ pwNever: [...list, origin] })
}

// ---- for Settings (Alchemy's own pages only: see handle() in ipc.ts) ----------------------------

/** #486 Changes a saved login, after Windows Hello. */
export async function updatePassword(id: string, username: string, password: string): Promise<boolean> {
  const e = load().find((x) => x.id === id)
  if (!e || !password || !(await unlock('Change your saved password'))) return false
  e.username = username
  if (e.password !== password) {
    e.password = password
    e.breaches = undefined
    e.checked = undefined
  }
  e.updated = Date.now()
  save()
  void checkEntry(e).then(save)
  return true
}

/** #493 Deletes every saved password, after Windows Hello. */
export async function removeAllPasswords(): Promise<boolean> {
  if (!load().length || !(await unlock('Delete all your saved passwords'))) return false
  entries = []
  save()
  return true
}

/** #502 Copies a password, and wipes it from the clipboard 30 seconds later (if it's still there). */
export async function copyPassword(id: string): Promise<boolean> {
  const e = load().find((x) => x.id === id)
  if (!e || !(await unlock('Copy your saved password'))) return false
  await clipboard.writeText(e.password)
  setTimeout(async () => {
    if ((await clipboard.readText()) === e.password) clipboard.clear()
  }, 30_000)
  return true
}

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

/**
 * Imports a CSV exported from Chrome, Edge, Brave, Opera or Firefox (url, username, password),
 * Bitwarden (login_uri, login_username, login_password) or 1Password (Url or Website, Username, Password).
 */
export async function importPasswordsCsv(): Promise<number> {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Import passwords (CSV from Chrome, Edge, Firefox, Bitwarden or 1Password)',
    filters: [{ name: 'Passwords CSV', extensions: ['csv'] }],
    properties: ['openFile']
  })
  if (canceled || !filePaths[0]) return 0
  const rows = parseCsv(readFileSync(filePaths[0], 'utf8'))
  const head = (rows.shift() ?? []).map((h) => h.trim().toLowerCase())
  const col = (...names: string[]): number => head.findIndex((h) => names.includes(h))
  const u = col('url', 'login_uri', 'website', 'web site', 'origin', 'hostname')
  const n = col('username', 'login_username', 'user', 'login', 'email')
  const p = col('password', 'login_password')
  if (u < 0 || p < 0) return 0
  let count = 0
  const list = load()
  for (const row of rows) {
    // Some exports leave out the https:// part.
    const raw = (row[u] ?? '').trim()
    const origin = originOf(/^[a-z]+:/i.test(raw) ? raw : `https://${raw}`)
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
