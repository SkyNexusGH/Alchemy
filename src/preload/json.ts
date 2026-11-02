/**
 * A JSON viewer for pages that are plain JSON (APIs, config files): a collapsible, colored
 * tree with a Raw view and Copy. Built with DOM calls in a closed shadow root, styled with
 * a constructed stylesheet so strict CSP headers (common on APIs) don't block it.
 */

const CSS = `
  :host { all: initial; display: block; }
  .wrap { font: 13px/1.55 'Cascadia Code', Consolas, ui-monospace, monospace; color: #d6dbe7; background: #0b1019;
    min-height: 100vh; box-sizing: border-box; padding: 52px 18px 24px; }
  .bar { position: fixed; top: 0; left: 0; right: 0; height: 40px; display: flex; align-items: center; gap: 6px;
    padding: 0 12px; background: #121a28; border-bottom: 1px solid #1f2a3d; font: 600 12.5px system-ui, 'Segoe UI', sans-serif; }
  .bar b { margin-right: auto; color: #ec4856; letter-spacing: .02em; }
  .bar small { color: #7d8aa3; font-weight: 500; margin-right: 8px; }
  button { font: inherit; color: #d6dbe7; background: #1c2638; border: 0; border-radius: 7px; height: 28px; padding: 0 12px; cursor: pointer; }
  button:hover { background: #26324a; }
  button.on { background: #ec4856; color: #fff; }
  .row { padding-left: 18px; position: relative; }
  .root > .row { padding-left: 0; }
  .tog { position: absolute; left: 0; width: 16px; cursor: pointer; color: #7d8aa3; user-select: none; }
  .root > .row > .tog { left: -16px; }
  .k { color: #9ecbff; }
  .s { color: #a5e3a1; word-break: break-word; }
  .n { color: #f7b267; }
  .b { color: #f28fad; }
  .z { color: #7d8aa3; }
  .p { color: #7d8aa3; }
  .sum { color: #7d8aa3; cursor: pointer; font-style: italic; }
  a { color: #a5e3a1; }
  pre { margin: 0; white-space: pre-wrap; word-break: break-word; }
  @media (prefers-color-scheme: light) {
    .wrap { background: #f6f7fb; color: #1d2433; }
    .bar { background: #fff; border-color: #e1e5ee; }
    button { background: #eef1f7; color: #1d2433; }
    button:hover { background: #e2e7f1; }
    .k { color: #1f5fbf; } .s, a { color: #2a7f3a; } .n { color: #b5560b; } .b { color: #b8306a; }
  }
`

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

function value(v: unknown): HTMLElement {
  if (v === null) return el('span', 'z', 'null')
  if (typeof v === 'string') {
    if (/^https?:\/\/\S+$/.test(v)) {
      const span = el('span', 's')
      const a = el('a', '', JSON.stringify(v))
      a.href = v
      span.appendChild(a)
      return span
    }
    return el('span', 's', JSON.stringify(v))
  }
  if (typeof v === 'number') return el('span', 'n', String(v))
  if (typeof v === 'boolean') return el('span', 'b', String(v))
  return el('span', 'z', String(v))
}

/** One key/value line; objects and arrays fold, and build their children only when opened. */
function node(key: string | null, v: unknown, depth: number, last: boolean): HTMLElement {
  const row = el('div', 'row')
  if (key !== null) {
    row.appendChild(el('span', 'k', JSON.stringify(key)))
    row.appendChild(el('span', 'p', ': '))
  }
  const comma = last ? '' : ','
  if (v === null || typeof v !== 'object') {
    row.appendChild(value(v))
    if (comma) row.appendChild(el('span', 'p', comma))
    return row
  }
  const isArray = Array.isArray(v)
  const entries = isArray ? (v as unknown[]).map((x, i) => [String(i), x] as const) : Object.entries(v as object)
  const [open, close] = isArray ? ['[', ']'] : ['{', '}']
  if (!entries.length) {
    row.appendChild(el('span', 'p', open + close + comma))
    return row
  }
  const tog = el('span', 'tog')
  const head = el('span', 'p', open)
  const summary = el('span', 'sum', ` ${entries.length} ${isArray ? (entries.length === 1 ? 'item' : 'items') : entries.length === 1 ? 'key' : 'keys'} `)
  const body = el('div')
  const tail = el('span', 'p', close + comma)
  let built = false
  const set = (expanded: boolean): void => {
    if (expanded && !built) {
      built = true
      entries.forEach(([k, x], i) => body.appendChild(node(isArray ? null : k, x, depth + 1, i === entries.length - 1)))
    }
    tog.textContent = expanded ? '▾' : '▸'
    body.style.display = expanded ? '' : 'none'
    summary.style.display = expanded ? 'none' : ''
  }
  tog.addEventListener('click', () => set(body.style.display === 'none'))
  summary.addEventListener('click', () => set(true))
  row.prepend(tog)
  row.append(head, summary, body, tail)
  set(depth < 2)
  return row
}

export function setupJsonViewer(): void {
  if (window.top !== window || !/^(application|text)\/([\w.-]+\+)?json$/.test(document.contentType)) return
  const start = (): void => {
    const pre = document.body?.querySelector('pre')
    const text = (pre ?? document.body)?.textContent ?? ''
    // Very large files would make a huge tree; they still get the pretty-printed text.
    if (!text.trim() || text.length > 20_000_000) return
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      return
    }

    const host = document.createElement('ovyra-json')
    const root = host.attachShadow({ mode: 'closed' })
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(CSS)
    root.adoptedStyleSheets = [sheet]

    const wrap = el('div', 'wrap')
    const bar = el('div', 'bar')
    bar.appendChild(el('b', '', 'JSON'))
    bar.appendChild(el('small', '', `${(text.length / 1024).toFixed(text.length < 10240 ? 1 : 0)} KB`))
    const treeBtn = el('button', 'on', 'Tree')
    const rawBtn = el('button', '', 'Raw')
    const copyBtn = el('button', '', 'Copy')
    bar.append(treeBtn, rawBtn, copyBtn)

    const big = text.length > 3_000_000
    const tree = el('div', 'root')
    if (!big) tree.appendChild(node(null, data, 0, true))
    const raw = el('pre', '', big ? JSON.stringify(data, null, 2) : '')
    raw.style.display = 'none'
    const show = (asRaw: boolean): void => {
      if (asRaw && !raw.textContent) raw.textContent = JSON.stringify(data, null, 2)
      raw.style.display = asRaw ? '' : 'none'
      tree.style.display = asRaw ? 'none' : ''
      treeBtn.classList.toggle('on', !asRaw)
      rawBtn.classList.toggle('on', asRaw)
    }
    if (big) {
      show(true)
      treeBtn.disabled = true
    }
    treeBtn.addEventListener('click', () => show(false))
    rawBtn.addEventListener('click', () => show(true))
    copyBtn.addEventListener('click', () => {
      void navigator.clipboard.writeText(JSON.stringify(data, null, 2)).then(() => {
        copyBtn.textContent = 'Copied'
        setTimeout(() => (copyBtn.textContent = 'Copy'), 1200)
      })
    })

    wrap.append(bar, tree, raw)
    root.appendChild(wrap)
    if (pre) pre.style.display = 'none'
    document.body.style.margin = '0'
    document.body.appendChild(host)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
  else start()
}
