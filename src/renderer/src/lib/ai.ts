/** Talks to the on-device AI (aiWorker.ts). Nothing here leaves this computer. */

export interface AiDoc {
  id: number
  title: string
  url: string
  text: string
}
export interface AiAnswer {
  answer: string
  score: number
  passage: string
  docId: number
  title: string
  url: string
}
/** How far a model download has got. */
export interface AiDownload {
  percent: number
  loadedMB: number
  totalMB: number
}

/** Below this the model is guessing, so Alchemy says it couldn't find an answer. */
export const CONFIDENT = 0.12
/** Below this an answer is shown, marked "Not sure". */
export const SURE = 0.35

let worker: Worker | null = null
let nextId = 1
const files = new Map<string, { loaded: number; total: number }>()
const READY_KEY = 'alchemy-ai-ready'
const SMART_KEY = 'alchemy-ai-smart-ready'
/** Requests waiting on the worker, so pausing a download can end them. */
const waiting = new Map<number, (err: Error) => void>()

function getWorker(): Worker {
  worker ??= new Worker(new URL('./aiWorker.ts', import.meta.url), { type: 'module' })
  return worker
}

const flag = (key: string): boolean => {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}
const setFlag = (key: string, on: boolean): void => {
  try {
    if (on) localStorage.setItem(key, '1')
    else localStorage.removeItem(key)
  } catch {
    /* no storage */
  }
}

/** Whether the models have been downloaded, so using them won't start a 90 MB download. */
export const aiDownloaded = (): boolean => flag(READY_KEY)
/** Whether the smarter model (about 480 MB) has been downloaded. */
export const smartDownloaded = (): boolean => flag(SMART_KEY)

function request<T>(message: object, onDownload?: (d: AiDownload) => void, smart = false): Promise<T> {
  const w = getWorker()
  const id = nextId++
  return new Promise((resolve, reject) => {
    const listen = (e: MessageEvent): void => {
      const m = e.data
      if (m.type === 'progress') {
        files.set(m.file, { loaded: m.loaded, total: m.total })
        let loaded = 0
        let total = 0
        for (const f of files.values()) {
          loaded += f.loaded
          total += f.total
        }
        onDownload?.({ percent: total ? Math.round((loaded / total) * 100) : 0, loadedMB: Math.round(loaded / 1048576), totalMB: Math.round(total / 1048576) })
        return
      }
      if (m.id !== id) return
      w.removeEventListener('message', listen)
      waiting.delete(id)
      if (m.type === 'error') return reject(new Error(m.message))
      setFlag(READY_KEY, true)
      if (smart) setFlag(SMART_KEY, true)
      resolve(m.answers as T)
    }
    waiting.set(id, (err) => {
      w.removeEventListener('message', listen)
      reject(err)
    })
    w.addEventListener('message', listen)
    w.postMessage({ id, smart, ...message })
  })
}

export function downloadAi(onDownload: (d: AiDownload) => void, smart = false): Promise<void> {
  return request<void>({}, onDownload, smart)
}

/**
 * Stops a download in progress. Files that finished are kept, so downloading again carries
 * on from there.
 */
export function pauseDownload(): void {
  worker?.terminate()
  worker = null
  files.clear()
  for (const end of waiting.values()) end(new Error('Paused'))
  waiting.clear()
}

export function askAi(question: string, docs: AiDoc[], onDownload?: (d: AiDownload) => void, topK = 4, opts: { hint?: string; smart?: boolean } = {}): Promise<AiAnswer[]> {
  return request<AiAnswer[]>({ question, docs, topK, hint: opts.hint }, onDownload, !!opts.smart)
}

/** Three short points about a page (smarter model only). */
export function summariseAi(doc: AiDoc, onDownload?: (d: AiDownload) => void): Promise<AiAnswer[]> {
  return request<AiAnswer[]>({ summarise: true, docs: [doc] }, onDownload, true)
}

/** The models were deleted (Settings): let go of them; they download again next time. */
export function forgetAiModels(): void {
  pauseDownload()
  setFlag(READY_KEY, false)
  setFlag(SMART_KEY, false)
}

/** Only the smarter model was deleted. */
export function forgetSmartModel(): void {
  pauseDownload()
  setFlag(SMART_KEY, false)
}

/** "And when was that?": a short question that leans on the one before it. */
export function isFollowUp(q: string): boolean {
  const t = q.trim().toLowerCase()
  if (/^(and|but|also|what about|how about|then)\b/.test(t)) return true
  const content = (t.match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => !/^(the|a|an|of|is|was|were|are|what|who|when|where|why|how|which|did|does|do)$/.test(w))
  return content.length <= 3 && /\b(it|its|that|this|they|them|their|he|she|his|her|there)\b/.test(t)
}
