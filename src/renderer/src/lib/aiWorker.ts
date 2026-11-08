/// <reference lib="webworker" />
import { env, pipeline } from '@huggingface/transformers'

/**
 * Alchemy's tiny on-device AI: about 90 MB in all, and it runs on almost any PC.
 *  - a 23 MB model finds the passages that best match your question;
 *  - a 65 MB model picks the exact answer out of them.
 * It doesn't write anything of its own: every answer is words quoted from the page, so it
 * can't make facts up. It runs entirely on this computer.
 */
env.allowLocalModels = false

interface Doc {
  id: number
  title: string
  url: string
  text: string
}
interface Passage {
  doc: Doc
  text: string
  keyword: number
}

type Embedder = (text: string[], opts: { pooling: 'mean'; normalize: boolean }) => Promise<{ tolist(): number[][] }>
type Reader = (question: string, context: string) => Promise<{ answer: string; score: number } | { answer: string; score: number }[]>

let models: Promise<{ embed: Embedder; read: Reader }> | null = null

const progress = (p: { status: string; file?: string; loaded?: number; total?: number }): void => {
  if (p.status === 'progress' && p.file && p.total) postMessage({ type: 'progress', file: p.file, loaded: p.loaded ?? 0, total: p.total })
}

function load(): Promise<{ embed: Embedder; read: Reader }> {
  models ??= (async () => {
    const opts = { dtype: 'q8', device: 'wasm', progress_callback: progress } as const
    const [embed, read] = await Promise.all([
      pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', opts),
      pipeline('question-answering', 'Xenova/distilbert-base-cased-distilled-squad', opts)
    ])
    return { embed: embed as unknown as Embedder, read: read as unknown as Reader }
  })()
  return models
}

const WORDS_PER_PASSAGE = 110
const STOP = new Set('the a an of to in on is are was were be for and or what who when where why how which does do did with this that it its at by from i me my you your'.split(' '))
const wordsOf = (t: string): string[] => t.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []

/** Cuts a page into overlapping passages, scored by how many of the question's words they have. */
function passages(docs: Doc[], question: string): Passage[] {
  const terms = new Set(wordsOf(question).filter((w) => !STOP.has(w)))
  const out: Passage[] = []
  for (const doc of docs) {
    const words = doc.text.split(/\s+/).filter(Boolean)
    for (let i = 0; i < words.length; i += Math.floor(WORDS_PER_PASSAGE * 0.7)) {
      const text = words.slice(i, i + WORDS_PER_PASSAGE).join(' ')
      if (text.length < 40) continue
      let keyword = 0
      const here = new Set(wordsOf(text))
      for (const t of terms) if (here.has(t)) keyword++
      out.push({ doc, text, keyword })
    }
  }
  return out
}

const dot = (a: number[], b: number[]): number => a.reduce((sum, v, i) => sum + v * b[i], 0)

async function ask(question: string, docs: Doc[], topK: number): Promise<{ answer: string; score: number; passage: string; docId: number; title: string; url: string }[]> {
  const { embed, read } = await load()
  // Words first (cheap), then meaning (slower), then the exact answer (slowest).
  const candidates = passages(docs, question)
    .sort((a, b) => b.keyword - a.keyword)
    .slice(0, 32)
  if (!candidates.length) return []
  const vectors = (await embed([question, ...candidates.map((c) => c.text)], { pooling: 'mean', normalize: true })).tolist()
  const q = vectors[0]
  const ranked = candidates
    .map((c, i) => ({ c, sim: dot(q, vectors[i + 1]) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, topK)
  const terms = [...new Set(wordsOf(question).filter((w) => !STOP.has(w)))]
  const answers = []
  for (const { c, sim } of ranked) {
    // The answer-finder always picks something, even from text that has nothing to do with
    // the question. So the passage must really be about it: most of the question's words
    // (or close forms: "climb" for "climbed") have to be there, and the meaning must match.
    const here = wordsOf(c.text)
    const covered = terms.filter((t) => here.some((w) => w === t || (t.length > 4 && w.startsWith(t.slice(0, 5))))).length
    if (sim < 0.2 || (terms.length && covered / terms.length < 0.5)) continue
    const raw = await read(question, c.text)
    const r = Array.isArray(raw) ? raw[0] : raw
    if (!r?.answer?.trim()) continue
    answers.push({ answer: asWritten(r.answer.trim(), c.text), score: r.score * (0.6 + 0.4 * Math.max(0, sim)), passage: c.text, docId: c.doc.id, title: c.doc.title, url: c.doc.url })
  }
  return answers.sort((a, b) => b.score - a.score)
}

/** The model puts spaces between tokens ("8, 844. 43 m"); use the words as the page wrote them. */
function asWritten(answer: string, passage: string): string {
  const pattern = answer
    .split(/\s+/)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s*')
  return passage.match(new RegExp(pattern, 'i'))?.[0] ?? answer
}

self.onmessage = async (e: MessageEvent<{ id: number; question?: string; docs?: Doc[]; topK?: number }>) => {
  const { id, question, docs, topK = 4 } = e.data
  try {
    if (!question) {
      await load()
      return postMessage({ type: 'ready', id })
    }
    postMessage({ type: 'done', id, answers: await ask(question, docs ?? [], topK) })
  } catch (err) {
    models = null
    postMessage({ type: 'error', id, message: err instanceof Error ? err.message : String(err) })
  }
}
