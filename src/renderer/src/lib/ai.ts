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

/** Below this the model is guessing, so Alchemy says it couldn't find an answer. */
export const CONFIDENT = 0.12

let worker: Worker | null = null
let nextId = 1
const files = new Map<string, { loaded: number; total: number }>()
const READY_KEY = 'alchemy-ai-ready'

function getWorker(): Worker {
  worker ??= new Worker(new URL('./aiWorker.ts', import.meta.url), { type: 'module' })
  return worker
}

/** Whether the models have been downloaded, so using them won't start a 90 MB download. */
export function aiDownloaded(): boolean {
  try {
    return localStorage.getItem(READY_KEY) === '1'
  } catch {
    return false
  }
}

function request<T>(message: object, onDownload?: (percent: number) => void): Promise<T> {
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
        onDownload?.(total ? Math.round((loaded / total) * 100) : 0)
        return
      }
      if (m.id !== id) return
      w.removeEventListener('message', listen)
      if (m.type === 'error') return reject(new Error(m.message))
      try {
        localStorage.setItem(READY_KEY, '1')
      } catch {
        /* no storage */
      }
      resolve(m.answers as T)
    }
    w.addEventListener('message', listen)
    w.postMessage({ id, ...message })
  })
}

export function downloadAi(onDownload: (percent: number) => void): Promise<void> {
  return request<void>({}, onDownload)
}

export function askAi(question: string, docs: AiDoc[], onDownload?: (percent: number) => void, topK = 4): Promise<AiAnswer[]> {
  return request<AiAnswer[]>({ question, docs, topK }, onDownload)
}

/** The models were deleted (Settings): let go of them; they download again next time. */
export function forgetAiModels(): void {
  worker?.terminate()
  worker = null
  files.clear()
  try {
    localStorage.removeItem(READY_KEY)
  } catch {
    /* no storage */
  }
}
