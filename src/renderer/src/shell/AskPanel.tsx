import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { api } from '../lib/api'
import { aiDownloaded, askAi, CONFIDENT, downloadAi, isFollowUp, pauseDownload, smartDownloaded, summariseAi, SURE, type AiAnswer, type AiDoc, type AiDownload } from '../lib/ai'
import { Lock, Sparkle, X } from '../lib/icons'
import { useSettings } from '../lib/settings'
import { Favicon } from '../lib/ui'

/** Whether the Ask panel is open beside the page. */
export const useAskPanel = create<{ open: boolean; toggle: () => void }>((set) => ({
  open: false,
  toggle: () => set((s) => ({ open: !s.open }))
}))

type Scope = 'page' | 'tabs' | 'selection'

interface Turn {
  question: string
  scope: Scope
  answers: AiAnswer[] | null
  error?: string
  /** A summary rather than an answer. */
  summary?: boolean
}

/**
 * Ask the page / Ask all my tabs. Questions are answered on this computer: the answer is
 * always words quoted from the page (or, with the smarter model, written from it), with a
 * link to where it found them.
 */
export function AskPanel(): React.JSX.Element {
  const close = useAskPanel((s) => s.toggle)
  const smart = useSettings((s) => s.settings?.lab?.smartAsk === true)
  const [scope, setScope] = useState<'page' | 'tabs'>('page')
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [ready, setReady] = useState(() => (smart ? smartDownloaded() : aiDownloaded()))
  const [download, setDownload] = useState<AiDownload | null>(null)
  const [paused, setPaused] = useState(false)
  const [busy, setBusy] = useState(false)
  /** Text selected on the page: questions go to just that until it's dropped. */
  const [selection, setSelection] = useState('')
  const log = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => setReady(smart ? smartDownloaded() : aiDownloaded()), [smart])
  useEffect(() => input.current?.focus(), [ready])
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' })
  }, [turns])
  // Look for a selection when the panel opens and whenever the input gets focus.
  const dropped = useRef('')
  const checkSelection = (): void => void api.invoke<string>('ai:selection').then((t) => setSelection(t === dropped.current ? '' : t))
  useEffect(checkSelection, [])

  async function get(): Promise<void> {
    setPaused(false)
    setDownload({ percent: 0, loadedMB: 0, totalMB: 0 })
    try {
      await downloadAi(setDownload, smart)
      setReady(true)
    } catch (err) {
      if (err instanceof Error && err.message === 'Paused') setPaused(true)
    } finally {
      setDownload(null)
    }
  }

  function pause(): void {
    pauseDownload()
    setPaused(true)
    setDownload(null)
  }

  async function run(turn: Turn, work: () => Promise<AiAnswer[]>): Promise<void> {
    setBusy(true)
    const at = turns.length
    setTurns((t) => [...t, turn])
    try {
      const answers = await work()
      setTurns((t) => t.map((x, i) => (i === at ? { ...x, answers } : x)))
    } catch (err) {
      setTurns((t) => t.map((x, i) => (i === at ? { ...x, answers: [], error: err instanceof Error ? err.message : String(err) } : x)))
    } finally {
      setDownload(null)
      setBusy(false)
    }
  }

  async function submit(): Promise<void> {
    const q = question.trim()
    if (!q || busy) return
    setQuestion('')
    const where: Scope = selection ? 'selection' : scope
    // "And when was that?" leans on the question before it.
    const last = turns.filter((t) => !t.summary).at(-1)
    const hint = last && isFollowUp(q) ? last.question : undefined
    await run({ question: q, scope: where, answers: null }, async () => {
      const docs = await api.invoke<AiDoc[]>('ai:docs', where)
      if (!docs.length) throw new Error(where === 'tabs' ? 'Your tabs have no text to read.' : where === 'selection' ? 'Select some text on the page first.' : 'This page has no text to read.')
      const answers = await askAi(q, docs, setDownload, where === 'tabs' ? 4 : 3, { hint, smart })
      return answers.filter((a) => a.score >= CONFIDENT)
    })
  }

  async function summarise(): Promise<void> {
    if (busy) return
    await run({ question: 'Summarise this page', scope: 'page', answers: null, summary: true }, async () => {
      const [doc] = await api.invoke<AiDoc[]>('ai:docs', selection ? 'selection' : 'page')
      if (!doc) throw new Error('This page has no text to read.')
      return summariseAi(doc, setDownload)
    })
  }

  const size = smart ? 'about 570 MB' : '90 MB'
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
          <p>Ask questions about a page or all your tabs, and get answers {smart ? 'written from them' : 'quoted straight from them'}. It never sends what you read anywhere, and it works offline.</p>
          <p>
            It needs a one-time download of {size}
            {smart ? ' and is fastest with a graphics card.' : ' and runs on almost any computer.'}
          </p>
          {download ? (
            <div className="ask-download">
              <div className="ask-bar">
                <i style={{ width: `${download.percent}%` }} />
              </div>
              <span>{download.totalMB ? `${download.loadedMB} of ${download.totalMB} MB` : 'Starting…'}</span>
              <button className="btn small" onClick={pause}>
                Pause
              </button>
            </div>
          ) : (
            <button className="btn primary" onClick={() => void get()}>
              {paused ? 'Resume download' : `Download (${size})`}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="ask-scope" role="group" aria-label="What to ask">
            <button className={scope === 'page' && !selection ? 'on' : ''} onClick={() => (setScope('page'), setSelection(''))}>
              This page
            </button>
            <button className={scope === 'tabs' && !selection ? 'on' : ''} onClick={() => (setScope('tabs'), setSelection(''))}>
              All my tabs
            </button>
          </div>
          {selection && (
            <div className="ask-selection">
              <span>About your selection: “{selection.slice(0, 60)}{selection.length > 60 ? '…' : ''}”</span>
              <button className="icon-btn" title="Ask about the whole page instead" onClick={() => ((dropped.current = selection), setSelection(''))}>
                <X size={12} />
              </button>
            </div>
          )}
          <div className="ask-log" ref={log}>
            {turns.length === 0 && (
              <div className="bm-empty">
                Ask something like “what’s the refund policy?” or “when was this founded?”. Short, factual questions work best, and you can follow up with “and when was that?”.
                {smart && (
                  <button className="btn small" style={{ marginTop: 10 }} onClick={() => void summarise()}>
                    Summarise this page
                  </button>
                )}
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className="ask-turn">
                <div className="ask-q">{t.question}</div>
                {t.answers === null && <div className="ask-thinking">{download ? `Getting ready… ${download.percent}%` : 'Reading…'}</div>}
                {t.error && <div className="ask-none">{t.error}</div>}
                {t.answers?.length === 0 && !t.error && (
                  <div className="ask-none">I couldn’t find that {t.scope === 'tabs' ? 'in your tabs' : t.scope === 'selection' ? 'in your selection' : 'on this page'}.</div>
                )}
                {t.answers?.map((a, j) => (
                  <button key={j} className="ask-a" title="Show me where" onClick={() => void api.invoke('ai:show', a.docId, t.summary || smart ? a.passage.split(/\s+/).slice(0, 6).join(' ') : a.answer)}>
                    <b className={t.summary ? 'ask-summary' : undefined}>
                      {a.answer}
                      {!t.summary && a.score < SURE && <span className="ask-unsure">Not sure</span>}
                    </b>
                    {!t.summary && !smart && <span className="ask-quote">“{quoteAround(a.passage, a.answer)}”</span>}
                    <span className="ask-source">
                      <Favicon url={a.url} size={13} />
                      {a.title}
                    </span>
                  </button>
                ))}
                {t.answers && t.answers.length > 1 && <div className="ask-more">{t.answers.length} possible answers, best first.</div>}
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
            <input
              ref={input}
              className="field"
              placeholder={selection ? 'Ask about your selection' : scope === 'page' ? 'Ask this page' : 'Ask all your tabs'}
              value={question}
              onFocus={checkSelection}
              onChange={(e) => setQuestion(e.target.value)}
            />
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
