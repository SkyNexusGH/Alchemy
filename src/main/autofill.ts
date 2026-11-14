import { app, ipcMain, safeStorage, type IpcMainInvokeEvent } from 'electron'
import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AutofillAddress, AutofillCard, AutofillCardInfo } from '@shared/types'
import { unlock } from './passwords'
import { getSettings } from './settings'
import { BrowserWin } from './window'

/**
 * Addresses and payment cards for filling in forms. Kept encrypted with Windows' own data
 * protection, like passwords, and never sent anywhere. Card security codes are never stored,
 * and filling a card asks for Windows Hello. Pages never see the list: only what you pick.
 */

interface Store {
  addresses: AutofillAddress[]
  cards: AutofillCard[]
}

const file = (): string => join(app.getPath('userData'), 'autofill.enc')
let data: Store = { addresses: [], cards: [] }
let loading: Promise<void> | null = null
let unencrypted = false

function load(): Promise<void> {
  return (loading ??= (async () => {
    try {
      if (!(await safeStorage.isAsyncEncryptionAvailable())) {
        unencrypted = true
        return
      }
      if (!existsSync(file())) return
      const { result } = await safeStorage.decryptStringAsync(readFileSync(file()))
      const saved = JSON.parse(result) as Partial<Store>
      data = { addresses: saved.addresses ?? [], cards: saved.cards ?? [] }
    } catch (err) {
      console.error('[autofill] could not read the autofill file', err)
      copyFileSync(file(), `${file()}.unreadable-${Date.now()}`)
    }
  })())
}

let writing = Promise.resolve()
function save(): void {
  writing = writing
    .then(load)
    .then(async () => {
      if (unencrypted) return
      writeFileSync(`${file()}.tmp`, await safeStorage.encryptStringAsync(JSON.stringify(data)))
      renameSync(`${file()}.tmp`, file())
    })
    .catch((err) => console.error('[autofill] could not save', err))
}

const cardInfo = (c: AutofillCard): AutofillCardInfo => ({ id: c.id, name: c.name, last4: c.number.slice(-4), expMonth: c.expMonth, expYear: c.expYear, brand: brandOf(c.number) })

export function brandOf(number: string): string {
  if (/^4/.test(number)) return 'Visa'
  if (/^(5[1-5]|2[2-7])/.test(number)) return 'Mastercard'
  if (/^3[47]/.test(number)) return 'American Express'
  if (/^6(011|5)/.test(number)) return 'Discover'
  return 'Card'
}

/** The Luhn check every real card number passes, so typos are caught when saving. */
export function validCardNumber(number: string): boolean {
  const digits = number.replace(/\D/g, '')
  if (digits.length < 12 || digits.length > 19) return false
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i])
    if (i % 2) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return sum % 10 === 0
}

// ---- for Settings --------------------------------------------------------------------------

export async function listAutofill(): Promise<{ addresses: AutofillAddress[]; cards: AutofillCardInfo[]; encrypted: boolean }> {
  await load()
  return { addresses: data.addresses, cards: data.cards.map(cardInfo), encrypted: !unencrypted }
}

export async function saveAddress(a: AutofillAddress): Promise<void> {
  await load()
  const clean: AutofillAddress = { ...a, id: a.id || randomUUID() }
  data.addresses = data.addresses.some((x) => x.id === clean.id) ? data.addresses.map((x) => (x.id === clean.id ? clean : x)) : [...data.addresses, clean]
  save()
}

export async function saveCard(c: { id?: string; name: string; number: string; expMonth: string; expYear: string }): Promise<string | null> {
  await load()
  const number = c.number.replace(/\D/g, '')
  if (!validCardNumber(number)) return 'That card number doesn’t look right.'
  if (!(await unlock('Save a payment card'))) return 'Not saved.'
  const card: AutofillCard = { id: c.id || randomUUID(), name: c.name.trim(), number, expMonth: c.expMonth, expYear: c.expYear }
  data.cards = data.cards.some((x) => x.id === card.id) ? data.cards.map((x) => (x.id === card.id ? card : x)) : [...data.cards, card]
  save()
  return null
}

export async function removeAutofill(kind: 'address' | 'card', id: string): Promise<void> {
  await load()
  if (kind === 'address') data.addresses = data.addresses.filter((x) => x.id !== id)
  else data.cards = data.cards.filter((x) => x.id !== id)
  save()
}

// ---- for pages (the preload in every top frame) ------------------------------------------------

const allowed = (event: IpcMainInvokeEvent): boolean => {
  const bw = BrowserWin.fromWebContents(event.sender)
  return !!event.senderFrame && event.senderFrame === event.sender.mainFrame && !!bw && !bw.tor && getSettings().autofill !== false
}

export function registerAutofillIpc(): void {
  void load()
  // What can be offered for a form: names and the last four digits only.
  ipcMain.handle('alchemy:af-query', async (event, kind: 'address' | 'card') => {
    if (!allowed(event)) return []
    await load()
    if (kind === 'address') return data.addresses.map((a) => ({ id: a.id, label: [a.name, a.street, a.city].filter(Boolean).join(', ') }))
    // Cards only on secure pages.
    if (!event.senderFrame!.url.startsWith('https:')) return []
    return data.cards.map((c) => ({ id: c.id, label: `${brandOf(c.number)} •••• ${c.number.slice(-4)}` }))
  })
  // You picked one: hand over its details (a card after Windows Hello).
  ipcMain.handle('alchemy:af-fill', async (event, kind: 'address' | 'card', id: string) => {
    if (!allowed(event)) return null
    await load()
    if (kind === 'address') return data.addresses.find((a) => a.id === id) ?? null
    const c = data.cards.find((x) => x.id === id)
    if (!c || !event.senderFrame!.url.startsWith('https:')) return null
    if (!(await unlock(`Fill your ${brandOf(c.number)} card ending ${c.number.slice(-4)}`))) return null
    return { name: c.name, number: c.number, expMonth: c.expMonth, expYear: c.expYear }
  })
}
