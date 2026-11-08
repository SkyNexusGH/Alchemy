import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { api } from '../lib/api'
import { aiDownloaded, askAi, CONFIDENT, downloadAi, type AiAnswer, type AiDoc } from '../lib/ai'
import { Lock, Sparkle, X } from '../lib/icons'
import { Favicon } from '../lib/ui'

/** Whether the Ask panel is open beside the page. */
export const useAskPanel = create<{ open: boolean; toggle: () => void }>((set) => ({
  open: false,
  toggle: () => set((s) => ({ open: !s.open }))
}))

interface Turn {
  question: string
  scope: 'page' | 'tabs'
  answers: AiAnswer[] | null
  error?: string
}

/**
 * Ask the page / Ask all my tabs. Questions are answered on this computer: the answer is
 * always words quoted from the page, with a link to where it found them.
 */
export function AskPanel(): React.JSX.Element {
  const close = useAskPanel((s) => s.toggle)
  const [scope, setScope] = useState<'page' | 'tabs'>('page')
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [ready, setReady] = useState(aiDownloaded)
  const [download, setDownload] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const log = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => input.current?.focus(), [ready])
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' })
  }, [turns])

  async function get(): Promise<void> {
    setDownload(0)
    try {
      await downloadAi(setDownload)
      setReady(true)
    } finally {
      setDownload(null)
    }
  }

  async function submit(): Promise<void> {
    const q = question.trim()
    if (!q || busy) return
    setQuestion('')
    setBusy(true)
    const at = turns.length
    setTurns((t) => [...t, { question: q, scope, answers: null }])
    try {
      const docs = await api.invoke<AiDoc[]>('ai:docs', scope)
      if (!docs.length) throw new Error(scope === 'page' ? 'This page has no text to read.' : 'Your tabs have no text to read.')
      const answers = await askAi(q, docs, setDownload)
      setTurns((t) => t.map((x, i) => (i === at ? { ...x, answers: answers.filter((a) => a.score >= CONFIDENT).slice(0, scope === 'page' ? 2 : 4) } : x)))
    } catch (err) {
      setTurns((t) => t.map((x, i) => (i === at ? { ...x, answers: [], error: err instanceof Error ? err.message : String(err) } : x)))
    } finally {
      setDownload(null)
      setBusy(false)
    }
  }

  return (
    <aside className="side-panel ask-panel">
      <div className="bm-panel-head">
        <Sparkle size={15} />
        <b>Ask</b>
        <span className="spacer" />
        <button className="icon-btn" title="Close" onClick={close}>
          <X size={14} />
        </button>
      </div>

      {!ready ? (
        <div className="ask-setup">
          <b>A tiny AI that stays on your PC</b>
          <p>Ask questions about a page or all your tabs, and get answers quoted straight from them. It never sends what you read anywhere, and it works offline.</p>
          <p>It needs a one-time download of about 90 MB and runs on almost any computer.</p>
          <button className="btn primary" disabled={download !== null} onClick={() => void get()}>
            {download !== null ? `Downloading… ${download}%` : 'Download (90 MB)'}
          </button>
        </div>
      ) : (
        <>
          <div className="ask-scope" role="group" aria-label="What to ask">
            <button className={scope === 'page' ? 'on' : ''} onClick={() => setScope('page')}>
              This page
            </button>
            <button className={scope === 'tabs' ? 'on' : ''} onClick={() => setScope('tabs')}>
              All my tabs
            </button>
          </div>
          <div className="ask-log" ref={log}>
            {turns.length === 0 && <div className="bm-empty">Ask something like “what’s the refund policy?” or “when was this founded?”. Short, factual questions work best.</div>}
            {turns.map((t, i) => (
              <div key={i} className="ask-turn">
                <div className="ask-q">{t.question}</div>
                {t.answers === null && <div className="ask-thinking">{download ? `Getting ready… ${download}%` : 'Reading…'}</div>}
                {t.error && <div className="ask-none">{t.error}</div>}
                {t.answers?.length === 0 && !t.error && <div className="ask-none">I couldn’t find that {t.scope === 'page' ? 'on this page' : 'in your tabs'}.</div>}
                {t.answers?.map((a, j) => (
                  <button key={j} className="ask-a" title="Show me where" onClick={() => void api.invoke('ai:show', a.docId, a.answer)}>
                    <b>{a.answer}</b>
                    <span className="ask-quote">“{quoteAround(a.passage, a.answer)}”</span>
                    <span className="ask-source">
                      <Favicon url={a.url} size={13} />
                      {a.title}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
          <form
            className="ask-input"
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
          >
            <input ref={input} className="field" placeholder={scope === 'page' ? 'Ask this page' : 'Ask all your tabs'} value={question} onChange={(e) => setQuestion(e.target.value)} />
          </form>
          <div className="ask-private">
            <Lock size={11} /> On your PC. Nothing is sent anywhere.
          </div>
        </>
      )}
    </aside>
  )
}

/** The words around the answer, so you can see it in context. */
function quoteAround(passage: string, answer: string): string {
  const at = passage.indexOf(answer)
  if (at === -1) return passage.slice(0, 160)
  const start = Math.max(0, at - 70)
  return `${start ? '…' : ''}${passage.slice(start, at + answer.length + 70).trim()}…`
}
