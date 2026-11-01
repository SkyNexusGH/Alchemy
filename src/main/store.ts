import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const stores = new Set<JsonStore<unknown>>()

/**
 * A small JSON-file store. Reads once at startup, writes are debounced and atomic
 * (write to a temp file, then rename) so a crash never leaves a half-written file.
 */
export class JsonStore<T> {
  data: T
  private readonly path: string
  private timer: NodeJS.Timeout | null = null

  constructor(
    name: string,
    defaults: T,
    private readonly delay = 1000
  ) {
    const dir = app.getPath('userData')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.path = join(dir, `${name}.json`)
    this.data = defaults
    try {
      if (existsSync(this.path)) {
        const loaded = JSON.parse(readFileSync(this.path, 'utf8'))
        this.data = isPlainObject(defaults) && isPlainObject(loaded) ? { ...defaults, ...loaded } : loaded
      }
    } catch (err) {
      console.error(`[store] could not read ${name}, starting fresh`, err)
    }
    stores.add(this as JsonStore<unknown>)
  }

  save(): void {
    if (this.timer) return
    this.timer = setTimeout(() => this.flush(), this.delay)
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    try {
      const tmp = `${this.path}.tmp`
      writeFileSync(tmp, JSON.stringify(this.data))
      renameSync(tmp, this.path)
    } catch (err) {
      console.error('[store] write failed', this.path, err)
    }
  }
}

export function flushAllStores(): void {
  for (const store of stores) store.flush()
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
