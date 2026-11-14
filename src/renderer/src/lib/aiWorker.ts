/// <reference lib="webworker" />
import { env, pipeline } from '@huggingface/transformers'

/**
 * Alchemy's tiny on-device AI: about 90 MB in all, and it runs on almost any PC.
 *  - a 23 MB model finds the passages that best match your question;
 *  - a 65 MB model picks the exact answer out of them.
 * It doesn't write anything of its own: every answer is words quoted from the page, so it
 * can't make facts up.
 *
 * The optional smarter model (about 480 MB, Qwen2.5 0.5B) reads the best passages and writes a
 * short answer in the question's own language, and can summarise a page. It uses the graphics
 * card when there is one. Everything runs on this computer.
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
interface Answer {
  answer: string
  score: number
  passage: string
  docId: number
  title: string
  url: string
}

type Embedder = (text: string[], opts: { pooling: 'mean'; normalize: boolean }) => Promise<{ tolist(): number[][] }>
type Reader = (question: string, context: string) => Promise<{ answer: string; score: number } | { answer: string; score: number }[]>
type Chat = { role: 'system' | 'user'; content: string }[]
type Writer = (messages: Chat, opts: Record<string, unknown>) => Promise<{ generated_text: Chat | string }[]>

let models: Promise<{ embed: Embedder; read: Reader }> | null = null
let writer: Promise<Writer> | null = null

const progress = (p: { status: string; file?: string; loaded?: number; total?: number }): void => {
  if (p.status === 'progress' && p.file && p.total) postMessage({ type: 'progress', file: p.file, loaded: p.loaded ?? 0, total: p.total })
}

const hasGpu = async (): Promise<boolean> => {
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
    return !!(gpu && (await gpu.requestAdapter()))
  } catch {
    return false
  }
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

const SMART_MODEL = 'onnx-community/Qwen2.5-0.5B-Instruct'

function loadWriter(): Promise<Writer> {
  writer ??= (async () => {
    // The graphics card is much faster; without one the same model runs on the processor.
    if (await hasGpu()) {
      try {
        return (await pipeline('text-generation', SMART_MODEL, { dtype: 'q4f16', device: 'webgpu', progress_callback: progress })) as unknown as Writer
      } catch {
        /* fall back to the processor */
      }
    }
    return (await pipeline('text-generation', SMART_MODEL, { dtype: 'q4', device: 'wasm', progress_callback: progress })) as unknown as Writer
  })()
  return writer
}

const WORDS_PER_PASSAGE = 110
const STOP = new Set('the a an of to in on is are was were be for and or what who when where why how which does do did with this that it its at by from i me my you your about'.split(' '))
const wordsOf = (t: string): string[] => t.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
const termsOf = (t: string): string[] => [...new Set(wordsOf(t).filter((w) => !STOP.has(w)))]
const has = (here: string[], t: string): boolean => here.some((w) => w === t || (t.length > 4 && w.startsWith(t.slice(0, 5))))

/** Cuts pages into overlapping passages, scored by how many of the question's words they have. */
function passages(docs: Doc[], terms: string[]): Passage[] {
  const out: Passage[] = []
  for (const doc of docs) {
    const words = doc.text.split(/\s+/).filter(Boolean)
    for (let i = 0; i < words.length; i += Math.floor(WORDS_PER_PASSAGE * 0.7)) {
      const text = words.slice(i, i + WORDS_PER_PASSAGE).join(' ')
      if (text.length < 40) continue
      const here = new Set(wordsOf(text))
      let keyword = 0
      for (const t of terms) if (here.has(t)) keyword++
      out.push({ doc, text, keyword })
    }
  }
  return out
}

/**
 * With many tabs, the tabs that are about the question come first: each tab is scored by how
 * many of the question's words it has (rare words count more), and only the best few are read.
 */
function relevantDocs(docs: Doc[], terms: string[]): Doc[] {
  if (docs.length <= 3 || !terms.length) return docs
  const words = docs.map((d) => new Set(wordsOf(`${d.title} ${d.text}`)))
  const score = docs.map((_, i) =>
    terms.reduce((sum, t) => {
      if (!words[i].has(t)) return sum
      const inDocs = words.filter((w) => w.has(t)).length
      return sum + Math.log(1 + docs.length / inDocs)
    }, 0)
  )
  return docs
    .map((d, i) => ({ d, s: score[i] }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 6)
    .map((x) => x.d)
}

/** The best passages: by words first (cheap), then by meaning, at most three from one tab. */
async function bestPassages(question: string, docs: Doc[], terms: string[], embed: Embedder, n: number): Promise<{ c: Passage; sim: number }[]> {
  const candidates = passages(docs, terms)
    .sort((a, b) => b.keyword - a.keyword)
    .slice(0, 40)
  if (!candidates.length) return []
  const vectors = (await embed([question, ...candidates.map((c) => c.text)], { pooling: 'mean', normalize: true })).tolist()
  const q = vectors[0]
  const perDoc = new Map<number, number>()
  return candidates
    .map((c, i) => ({ c, sim: dot(q, vectors[i + 1]) }))
    .sort((a, b) => b.sim - a.sim)
    .filter(({ c }) => {
      const k = perDoc.get(c.doc.id) ?? 0
      perDoc.set(c.doc.id, k + 1)
      return k < 3
    })
    .slice(0, n)
}

const dot = (a: number[], b: number[]): number => a.reduce((sum, v, i) => sum + v * b[i], 0)

async function ask(question: string, docs: Doc[], topK: number, hint: string): Promise<Answer[]> {
  const { embed, read } = await load()
  // A follow-up ("and when was that?") borrows the words of the question before it.
  const terms = termsOf(`${question} ${hint}`)
  const pool = relevantDocs(docs, terms)
  const ranked = await bestPassages(hint ? `${hint} ${question}` : question, pool, terms, embed, topK + 2)
  const own = termsOf(question)
  const answers: Answer[] = []
  for (const { c, sim } of ranked) {
    // The answer-finder always picks something, even from text that has nothing to do with
    // the question. So the passage must really be about it: most of the question's words
    // (or close forms: "climb" for "climbed") have to be there, and the meaning must match.
    const here = wordsOf(c.text)
    const need = hint ? terms : own
    const covered = need.filter((t) => has(here, t)).length
    if (sim < 0.2 || (need.length && covered / need.length < 0.5)) continue
    const raw = await read(hint ? `${question} (${hint})` : question, c.text)
    const r = Array.isArray(raw) ? raw[0] : raw
    if (!r?.answer?.trim()) continue
    const answer = asWritten(r.answer.trim(), c.text)
    // The same answer from two passages counts once, with the better score.
    const dup = answers.find((a) => a.answer.toLowerCase() === answer.toLowerCase())
    const score = r.score * (0.6 + 0.4 * Math.max(0, sim))
    if (dup) {
      dup.score = Math.max(dup.score, score)
      continue
    }
    answers.push({ answer, score, passage: c.text, docId: c.doc.id, title: c.doc.title, url: c.doc.url })
  }
  return answers.sort((a, b) => b.score - a.score).slice(0, topK)
}

/** The smarter model: writes a short answer from the best passages, in the question's language. */
async function askSmart(question: string, docs: Doc[], hint: string): Promise<Answer[]> {
  const { embed } = await load()
  const terms = termsOf(`${question} ${hint}`)
  const ranked = await bestPassages(hint ? `${hint} ${question}` : question, relevantDocs(docs, terms), terms, embed, 4)
  // A question in another language may share no words with the page: then read the start.
  const picked = ranked.length ? ranked.map((r) => r.c) : passages(docs.slice(0, 2), []).slice(0, 4)
  if (!picked.length) return []
  const context = picked.map((p, i) => `[${i + 1}] ${p.doc.title}\n${p.text}`).join('\n\n')
  const text = await write([
    {
      role: 'system',
      content:
        'You answer questions using only the numbered texts. Answer in the language of the question, in one or two short sentences. If the texts do not contain the answer, reply exactly: NOT_FOUND'
    },
    { role: 'user', content: `${context}\n\n${hint ? `Earlier question: ${hint}\n` : ''}Question: ${question}` }
  ])
  if (!text || /NOT_FOUND/i.test(text)) return []
  // The passage that shares the most words with the answer is where it came from.
  const words = termsOf(text)
  const source = picked
    .map((p) => ({ p, n: words.filter((w) => has(wordsOf(p.text), w)).length }))
    .sort((a, b) => b.n - a.n)[0].p
  return [{ answer: text, score: 0.9, passage: source.text, docId: source.doc.id, title: source.doc.title, url: source.doc.url }]
}

async function summarise(doc: Doc): Promise<Answer[]> {
  const words = doc.text.split(/\s+/).filter(Boolean).slice(0, 900).join(' ')
  if (words.length < 200) return []
  const text = await write([
    { role: 'system', content: 'Summarise the text in three short bullet points, each starting with "• ". Use the language of the text.' },
    { role: 'user', content: words }
  ])
  return text ? [{ answer: text, score: 0.9, passage: words.slice(0, 300), docId: doc.id, title: doc.title, url: doc.url }] : []
}

async function write(messages: Chat): Promise<string> {
  const gen = await loadWriter()
  const out = await gen(messages, { max_new_tokens: 160, do_sample: false })
  const g = out[0]?.generated_text
  const text = typeof g === 'string' ? g : (g?.at(-1)?.content ?? '')
  return text.trim()
}

/** The model puts spaces between tokens ("8, 844. 43 m"); use the words as the page wrote them. */
function asWritten(answer: string, passage: string): string {
  const pattern = answer
    .split(/\s+/)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s*')
  return passage.match(new RegExp(pattern, 'i'))?.[0] ?? answer
}

interface Request {
  id: number
  question?: string
  docs?: Doc[]
  topK?: number
  /** The question before this one, for follow-ups. */
  hint?: string
  smart?: boolean
  summarise?: boolean
}

self.onmessage = async (e: MessageEvent<Request>) => {
  const { id, question, docs = [], topK = 4, hint = '', smart, summarise: sum } = e.data
  try {
    if (sum) return postMessage({ type: 'done', id, answers: docs[0] ? await summarise(docs[0]) : [] })
    if (!question) {
      await load()
      if (smart) await loadWriter()
      return postMessage({ type: 'ready', id })
    }
    postMessage({ type: 'done', id, answers: smart ? await askSmart(question, docs, hint) : await ask(question, docs, topK, hint) })
  } catch (err) {
    models = null
    writer = null
    postMessage({ type: 'error', id, message: err instanceof Error ? err.message : String(err) })
  }
}
