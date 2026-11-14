import { ipcRenderer } from 'electron'

/**
 * The password manager's and autofill's part inside pages. It runs in Alchemy's isolated
 * world, so the page's scripts can't reach this code or the picker (a closed shadow root).
 * Only top-level pages take part: a form inside an embedded frame is never offered or captured.
 */
export function setupPasswords(): void {
  if (window.top !== window) return

  const shown = (i: HTMLElement): boolean => i.offsetParent !== null
  const passwordFields = (root: ParentNode = document): HTMLInputElement[] =>
    [...root.querySelectorAll<HTMLInputElement>('input[type="password"]')].filter((i) => shown(i) && !i.disabled && !i.readOnly)
  const visiblePassword = (root: ParentNode = document): HTMLInputElement | null => passwordFields(root)[0] ?? null

  const usernameFor = (pw: HTMLInputElement): HTMLInputElement | null => {
    const scope: ParentNode = pw.form ?? document
    const fields = [...scope.querySelectorAll<HTMLInputElement>('input')].filter((i) => shown(i) && /^(text|email|tel|)$/.test(i.type) && !i.disabled)
    const before = fields.filter((i) => i.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING)
    return before[before.length - 1] ?? fields[0] ?? null
  }

  /** A sign-up or change-password form: it wants a new password, not a saved one. */
  const wantsNewPassword = (pw: HTMLInputElement): boolean => {
    if (pw.autocomplete === 'new-password') return true
    if (pw.autocomplete === 'current-password') return false
    const scope: ParentNode = pw.form ?? document
    if (passwordFields(scope).length >= 2) return true
    const words = `${pw.name} ${pw.id} ${pw.placeholder} ${pw.getAttribute('aria-label') ?? ''} ${(pw.form?.textContent ?? '').slice(0, 400)}`.toLowerCase()
    return /sign ?up|register|create (an |your )?account|new password|confirm password|choose a password/.test(words)
  }

  // ---- offering to save (#481: only after a real sign-in) -----------------------------------
  // Clicking a button or pressing Enter only notes the login. It's offered for saving once the
  // form really went: the page navigates away, or the password box goes away (sites that sign
  // in without loading a new page).
  let sent = ''
  let candidate: { username: string; password: string; at: number; field: HTMLInputElement } | null = null
  const send = (): void => {
    const c = candidate
    candidate = null
    if (!c || Date.now() - c.at > 15_000) return
    const key = `${c.username}\n${c.password}`
    if (key === sent) return
    sent = key
    ipcRenderer.send('alchemy:pw-captured', { username: c.username, password: c.password })
  }
  let watching = 0
  const note = (): void => {
    const pw = visiblePassword()
    if (!pw?.value) return
    candidate = { username: usernameFor(pw)?.value ?? '', password: pw.value, at: Date.now(), field: pw }
    // Watch the password box for a few seconds: gone (or emptied by a page that moved on) means signed in.
    window.clearInterval(watching)
    const started = Date.now()
    watching = window.setInterval(() => {
      const c = candidate
      if (!c) return window.clearInterval(watching)
      if (!c.field.isConnected || !shown(c.field)) {
        window.clearInterval(watching)
        send()
      } else if (Date.now() - started > 8000) {
        // Still there after a while: probably a wrong password or a form error. Forget it.
        window.clearInterval(watching)
        candidate = null
      }
    }, 400)
  }
  document.addEventListener('submit', note, true)
  document.addEventListener('keydown', (e) => e.key === 'Enter' && (e.target as HTMLElement | null)?.closest?.('input[type="password"]') && note(), true)
  document.addEventListener('click', (e) => (e.target as HTMLElement | null)?.closest?.('button, input[type="submit"], [role="button"]') && note(), true)
  window.addEventListener('pagehide', send)

  // ---- filling ----------------------------------------------------------------------------
  // Frameworks watch the real value setter, so go through it and announce the change.
  const setValue = (input: HTMLInputElement | HTMLSelectElement, value: string): void => {
    if (input instanceof HTMLSelectElement) {
      const want = value.toLowerCase()
      const opt = [...input.options].find((o) => o.value.toLowerCase() === want || o.text.trim().toLowerCase() === want || o.value.replace(/^0/, '') === want.replace(/^0/, ''))
      if (!opt) return
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(input, opt.value)
    } else {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }

  let host: HTMLElement | null = null
  const closePicker = (): void => {
    host?.remove()
    host = null
  }

  /** A small menu under a field. Items act only on real (trusted) clicks. */
  function picker(field: HTMLElement, items: { label: string; hint?: string; act: () => void }[]): void {
    closePicker()
    if (!items.length || document.activeElement !== field) return
    const r = field.getBoundingClientRect()
    host = document.createElement('div')
    host.style.cssText = `position:fixed;z-index:2147483647;left:${r.left}px;top:${r.bottom + 4}px`
    const shadow = host.attachShadow({ mode: 'closed' })
    const box = document.createElement('div')
    box.style.cssText =
      'min-width:240px;max-width:360px;padding:5px;border-radius:10px;background:#131b2a;color:#e6e9f0;font:13px system-ui;box-shadow:0 12px 30px rgba(0,0,0,.45),0 0 0 1px rgba(230,233,240,.15)'
    for (const it of items) {
      const item = document.createElement('button')
      item.textContent = it.label
      if (it.hint) {
        const hint = document.createElement('div')
        hint.textContent = it.hint
        hint.style.cssText = 'margin-top:2px;color:#9aa3b5;font-size:11.5px;font-family:ui-monospace,Consolas,monospace;overflow:hidden;text-overflow:ellipsis'
        item.appendChild(hint)
      }
      item.style.cssText = 'display:block;width:100%;padding:7px 9px;border:0;border-radius:7px;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer'
      item.onmouseenter = () => (item.style.background = 'rgba(230,233,240,.1)')
      item.onmouseleave = () => (item.style.background = 'none')
      // Not a plain click handler: the page must not be able to fake one by scripting.
      item.addEventListener('mousedown', (e) => {
        e.preventDefault()
        if (!e.isTrusted) return
        closePicker()
        it.act()
      })
      box.appendChild(item)
    }
    shadow.appendChild(box)
    document.documentElement.appendChild(host)
  }

  async function offerLogins(field: HTMLInputElement, pw: HTMLInputElement): Promise<void> {
    const items: { label: string; hint?: string; act: () => void }[] = []
    // #483 A strong password for sign-up forms.
    if (field === pw && wantsNewPassword(pw)) {
      const strong = (await ipcRenderer.invoke('alchemy:pw-generate')) as string | null
      if (strong)
        items.push({
          label: '🔐 Use a strong password',
          hint: strong,
          act: () => {
            // Offered for saving once the form goes through.
            for (const f of passwordFields(pw.form ?? document)) setValue(f, strong)
          }
        })
    }
    const logins = (await ipcRenderer.invoke('alchemy:pw-query')) as { id: string; username: string }[]
    for (const login of logins.slice(0, 6))
      items.push({
        label: `🔑 ${login.username || '(no username)'}`,
        act: async () => {
          const got = (await ipcRenderer.invoke('alchemy:pw-fill', login.id)) as { username: string; password: string } | null
          if (!got) return
          const p = visiblePassword()
          if (!p) return
          const user = usernameFor(p)
          if (user && got.username) setValue(user, got.username)
          setValue(p, got.password)
          // What we filled isn't new: don't offer to save it again.
          sent = `${got.username}\n${got.password}`
        }
      })
    picker(field, items)
  }

  // ---- addresses and cards (#508, #509) -----------------------------------------------------
  type Part = 'name' | 'given' | 'family' | 'org' | 'street' | 'line2' | 'city' | 'region' | 'postcode' | 'country' | 'phone' | 'email' | 'cc-name' | 'cc-number' | 'cc-exp' | 'cc-month' | 'cc-year'
  const AUTOCOMPLETE: Record<string, Part> = {
    name: 'name', 'given-name': 'given', 'family-name': 'family', organization: 'org', 'street-address': 'street', 'address-line1': 'street',
    'address-line2': 'line2', 'address-level2': 'city', 'address-level1': 'region', 'postal-code': 'postcode', country: 'country', 'country-name': 'country',
    tel: 'phone', email: 'email', 'cc-name': 'cc-name', 'cc-number': 'cc-number', 'cc-exp': 'cc-exp', 'cc-exp-month': 'cc-month', 'cc-exp-year': 'cc-year'
  }
  const GUESS: [RegExp, Part][] = [
    [/card.?number|cc.?num|cardnum/, 'cc-number'], [/name.?on.?card|card.?holder|cc.?name/, 'cc-name'], [/exp.*month|cc.?month/, 'cc-month'],
    [/exp.*year|cc.?year/, 'cc-year'], [/expir|exp.?date|mm.?yy/, 'cc-exp'], [/e.?mail/, 'email'], [/phone|mobile|tel/, 'phone'],
    [/post.?code|zip/, 'postcode'], [/city|town|locality/, 'city'], [/county|state|province|region/, 'region'], [/country/, 'country'],
    [/address.?(line)?.?2|apartment|suite|flat/, 'line2'], [/address|street/, 'street'], [/company|organi[sz]ation/, 'org'],
    [/first.?name|given/, 'given'], [/last.?name|surname|family/, 'family'], [/full.?name|^name$|your.?name/, 'name']
  ]
  const partOf = (el: HTMLInputElement | HTMLSelectElement): Part | null => {
    const ac = (el.getAttribute('autocomplete') ?? '').toLowerCase().split(/\s+/).pop() ?? ''
    if (AUTOCOMPLETE[ac]) return AUTOCOMPLETE[ac]
    if (el instanceof HTMLInputElement && !/^(text|email|tel|number|)$/.test(el.type)) return null
    const words = `${el.name} ${el.id} ${el.getAttribute('placeholder') ?? ''} ${el.getAttribute('aria-label') ?? ''}`.toLowerCase()
    return GUESS.find(([re]) => re.test(words))?.[1] ?? null
  }
  const formFields = (from: HTMLElement): (HTMLInputElement | HTMLSelectElement)[] => {
    const scope: ParentNode = (from as HTMLInputElement).form ?? document
    return [...scope.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select')].filter((i) => shown(i) && !i.disabled)
  }

  async function offerAutofill(field: HTMLInputElement | HTMLSelectElement, part: Part): Promise<void> {
    const kind = part.startsWith('cc-') ? 'card' : 'address'
    const saved = (await ipcRenderer.invoke('alchemy:af-query', kind)) as { id: string; label: string }[]
    picker(
      field,
      saved.slice(0, 5).map((s) => ({
        label: `${kind === 'card' ? '💳' : '🏠'} ${s.label}`,
        act: async () => {
          const v = (await ipcRenderer.invoke('alchemy:af-fill', kind, s.id)) as Record<string, string> | null
          if (!v) return
          const [given, ...rest] = (v.name ?? '').split(' ')
          const yy = (v.expYear ?? '').slice(-2)
          const value: Record<Part, string | undefined> = {
            name: v.name, given, family: rest.join(' '), org: v.organization, street: v.street, line2: undefined, city: v.city, region: v.region,
            postcode: v.postcode, country: v.country, phone: v.phone, email: v.email,
            'cc-name': v.name, 'cc-number': v.number, 'cc-exp': v.expMonth && `${v.expMonth.padStart(2, '0')}/${yy}`, 'cc-month': v.expMonth, 'cc-year': v.expYear
          }
          for (const f of formFields(field)) {
            const p = partOf(f)
            if (!p || p.startsWith('cc-') !== (kind === 'card')) continue
            const val = value[p]
            if (val) setValue(f, f instanceof HTMLSelectElement && p === 'cc-year' && ![...f.options].some((o) => o.value === val) ? yy : val)
          }
        }
      }))
    )
  }

  document.addEventListener(
    'focusin',
    (e) => {
      const t = e.target as HTMLInputElement | HTMLSelectElement | null
      if (t?.tagName !== 'INPUT') return closePicker()
      const pw = visiblePassword()
      if (pw && (t === pw || t === usernameFor(pw)) && t instanceof HTMLInputElement) return void offerLogins(t, pw)
      const part = partOf(t)
      if (part && !t.value) return void offerAutofill(t, part)
      closePicker()
    },
    true
  )
  document.addEventListener('focusout', () => setTimeout(() => document.activeElement?.tagName !== 'INPUT' && closePicker(), 120), true)
  window.addEventListener('scroll', closePicker, true)
}
