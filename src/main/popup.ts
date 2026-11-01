import type { MenuItem, MenuItemConstructorOptions, WebContents } from 'electron'
import type { MenuModel } from '@shared/types'
import type { BrowserWin } from './window'

/**
 * Ovyra draws its own menus (right-click, app menu, tab menu…) in the overlay layer,
 * so they match the browser instead of looking like Windows. Menus are described with
 * Electron's usual menu templates; this turns them into a plain model and keeps the
 * click handlers here until an item is chosen.
 */

type Source = MenuItemConstructorOptions | MenuItem
const handlers = new Map<string, () => void>()
let nextId = 1

function convert(items: Source[], wc?: WebContents): MenuModel[] {
  const out: MenuModel[] = []
  for (const item of items) {
    if (item.visible === false) continue
    if (item.type === 'separator') {
      if (out.length && out[out.length - 1].type !== 'separator') out.push({ id: '', type: 'separator', enabled: false })
      continue
    }
    const id = String(nextId++)
    const sub = item.submenu
    const subItems: Source[] | undefined = !sub ? undefined : Array.isArray(sub) ? sub : (sub as Electron.Menu).items
    const role = 'role' in item ? item.role : undefined
    const click = item.click as ((...args: unknown[]) => void) | undefined
    if (click) handlers.set(id, () => click(item, undefined, {}))
    else if (role && wc) {
      const actions: Record<string, () => void> = {
        cut: () => wc.cut(),
        copy: () => wc.copy(),
        paste: () => wc.paste(),
        selectAll: () => wc.selectAll(),
        undo: () => wc.undo(),
        redo: () => wc.redo()
      }
      if (actions[role]) handlers.set(id, actions[role])
    }
    const roleLabels: Record<string, string> = { cut: 'Cut', copy: 'Copy', paste: 'Paste', selectAll: 'Select all', undo: 'Undo', redo: 'Redo' }
    out.push({
      id,
      type: item.type === 'checkbox' || item.type === 'radio' ? item.type : 'normal',
      label: item.label || (role ? roleLabels[role] : '') || '',
      hint: typeof item.accelerator === 'string' ? item.accelerator : undefined,
      enabled: item.enabled !== false,
      checked: item.checked,
      submenu: subItems ? convert(subItems, wc) : undefined
    })
  }
  while (out.length && out[out.length - 1].type === 'separator') out.pop()
  return out
}

/** Shows a menu at (x, y) in window coordinates. */
export function showMenu(bw: BrowserWin, items: Source[], x: number, y: number, wc?: WebContents): void {
  handlers.clear()
  const model = convert(items, wc)
  if (!model.length) return
  bw.showMenuOverlay(model, x, y)
}

export function chooseMenuItem(id: string): void {
  const fn = handlers.get(id)
  handlers.clear()
  fn?.()
}
