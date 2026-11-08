import { ipcRenderer } from 'electron'

/**
 * The password manager's part inside pages. It runs in Alchemy's isolated world, so the
 * page's scripts can't reach this code or the picker (a closed shadow root). Only top-level
 * pages take part: a login inside an embedded frame is never offered or captured.
 */
export function setupPasswords(): void {
  if (window.top !== window) return

  const visiblePassword = (root: ParentNode = document): HTMLInputElement | null =>
    [...root.querySelectorAll<HTMLInputElement>('input[type="password"]')].find((i) => i.offsetParent !== null && !i.disabled && !i.readOnly) ?? null

  const usernameFor = (pw: HTMLInputElement): HTMLInputElement | null => {
    const scope: ParentNode = pw.form ?? document
    const fields = [...scope.querySelectorAll<HTMLInputElement>('input')].filter(
      (i) => i.offsetParent !== null && /^(text|email|tel|)$/.test(i.type) && !i.disabled
    )
    const before = fields.filter((i) => i.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING)
    return before[before.length - 1] ?? fields[0] ?? null
  }

  // ---- offering to save -------------------------------------------------------------------
  let sent = ''
  const capture = (): void => {
    const pw = visiblePassword()
    if (!pw?.value) return
    const username = usernameFor(pw)?.value ?? ''
    const key = `${username}\n${pw.value}`
    if (key === sent) return
    sent = key
    ipcRenderer.send('ovyra:pw-captured', { username, password: pw.value })
  }
  document.addEventListener('submit', capture, true)
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Enter' && (e.target as HTMLElement | null)?.closest?.('input[type="password"]')) capture()
    },
    true
  )
  document.addEventListener(
    'click',
    (e) => {
      if ((e.target as HTMLElement | null)?.closest?.('button, input[type="submit"], [role="button"]')) capture()
    },
    true
  )

  // ---- filling ----------------------------------------------------------------------------
  // Frameworks watch the real value setter, so go through it and announce the change.
  const setValue = (input: HTMLInputElement, value: string): void => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }

  let host: HTMLElement | null = null
  const closePicker = (): void => {
    host?.remove()
    host = null
  }

  async function offer(field: HTMLInputElement): Promise<void> {
    const logins = (await ipcRenderer.invoke('ovyra:pw-query')) as { id: string; username: string }[]
    if (!logins.length || document.activeElement !== field) return
    closePicker()
    const r = field.getBoundingClientRect()
    host = document.createElement('div')
    host.style.cssText = `position:fixed;z-index:2147483647;left:${r.left}px;top:${r.bottom + 4}px`
    const shadow = host.attachShadow({ mode: 'closed' })
    const box = document.createElement('div')
    box.style.cssText =
      'min-width:220px;padding:5px;border-radius:10px;background:#131b2a;color:#e6e9f0;font:13px system-ui;box-shadow:0 12px 30px rgba(0,0,0,.45),0 0 0 1px rgba(230,233,240,.15)'
    for (const login of logins.slice(0, 6)) {
      const item = document.createElement('button')
      item.textContent = `🔑 ${login.username || '(no username)'}`
      item.style.cssText = 'display:block;width:100%;padding:7px 9px;border:0;border-radius:7px;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer'
      item.onmouseenter = () => (item.style.background = 'rgba(230,233,240,.1)')
      item.onmouseleave = () => (item.style.background = 'none')
      // Not a plain click handler: the page must not be able to fake one by scripting.
      item.addEventListener('mousedown', async (e) => {
        e.preventDefault()
        if (!e.isTrusted) return
        closePicker()
        const login2 = (await ipcRenderer.invoke('ovyra:pw-fill', login.id)) as { username: string; password: string } | null
        if (!login2) return
        const pw = visiblePassword()
        if (!pw) return
        const user = usernameFor(pw)
        if (user && login2.username) setValue(user, login2.username)
        setValue(pw, login2.password)
        // What we filled isn't new: don't offer to save it again.
        sent = `${login2.username}\n${login2.password}`
      })
      box.appendChild(item)
    }
    shadow.appendChild(box)
    document.documentElement.appendChild(host)
  }

  document.addEventListener(
    'focusin',
    (e) => {
      const t = e.target as HTMLInputElement | null
      if (t?.tagName !== 'INPUT') return closePicker()
      const pw = visiblePassword()
      if (pw && (t === pw || t === usernameFor(pw))) void offer(t)
      else closePicker()
    },
    true
  )
  document.addEventListener('focusout', () => setTimeout(() => document.activeElement?.tagName !== 'INPUT' && closePicker(), 120), true)
  window.addEventListener('scroll', closePicker, true)
}
