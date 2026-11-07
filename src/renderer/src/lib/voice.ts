/**
 * Voice search: records from the microphone until you stop talking (or click again),
 * then Whisper turns it into text on this computer (voiceWorker.ts).
 */
export type VoiceState =
  | { kind: 'idle' }
  | { kind: 'listening' }
  | { kind: 'downloading'; percent: number }
  | { kind: 'transcribing' }
  | { kind: 'error'; message: string }

let worker: Worker | null = null
let nextId = 1
const files = new Map<string, { loaded: number; total: number }>()

function getWorker(): Worker {
  worker ??= new Worker(new URL('./voiceWorker.ts', import.meta.url), { type: 'module' })
  return worker
}

/** Whisper takes 16 kHz mono audio. */
async function toSamples(blob: Blob): Promise<Float32Array> {
  const ctx = new AudioContext({ sampleRate: 16000 })
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer())
    return buf.getChannelData(0).slice()
  } finally {
    void ctx.close()
  }
}

let stopNow: (() => void) | null = null

/** Stops a recording in progress (the mic button clicked again). */
export function stopListening(): void {
  stopNow?.()
}

/** Listens, then transcribes. Resolves with the words spoken ('' if nothing was heard). */
export async function listen(onState: (s: VoiceState) => void): Promise<string> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
  onState({ kind: 'listening' })
  const recorder = new MediaRecorder(stream)
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => chunks.push(e.data)

  // Stop after ~1.4 s of quiet once you've started talking, or after 15 s at most.
  const ctx = new AudioContext()
  const analyser = ctx.createAnalyser()
  ctx.createMediaStreamSource(stream).connect(analyser)
  const data = new Uint8Array(analyser.fftSize)
  let spoke = false
  let quietSince = performance.now()
  const started = performance.now()

  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve()
    stopNow = () => recorder.state === 'recording' && recorder.stop()
    const check = (): void => {
      if (recorder.state !== 'recording') return
      analyser.getByteTimeDomainData(data)
      let sum = 0
      for (const v of data) sum += ((v - 128) / 128) ** 2
      const loud = Math.sqrt(sum / data.length) > 0.035
      const now = performance.now()
      if (loud) {
        spoke = true
        quietSince = now
      }
      if ((spoke && now - quietSince > 1400) || now - started > 15000 || (!spoke && now - started > 6000)) recorder.stop()
      else requestAnimationFrame(check)
    }
    requestAnimationFrame(check)
  })
  recorder.start()
  await stopped
  stopNow = null
  stream.getTracks().forEach((t) => t.stop())
  void ctx.close()
  if (!spoke && chunks.length === 0) return ''

  const audio = await toSamples(new Blob(chunks, { type: recorder.mimeType }))
  const w = getWorker()
  const id = nextId++
  onState({ kind: 'transcribing' })
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent): void => {
      const m = e.data
      if (m.type === 'progress') {
        files.set(m.file, { loaded: m.loaded, total: m.total })
        let loaded = 0
        let total = 0
        for (const f of files.values()) {
          loaded += f.loaded
          total += f.total
        }
        onState({ kind: 'downloading', percent: total ? Math.round((loaded / total) * 100) : 0 })
        return
      }
      if (m.id !== id) return
      w.removeEventListener('message', onMessage)
      if (m.type === 'done') resolve(m.text)
      else reject(new Error(m.message))
    }
    w.addEventListener('message', onMessage)
    w.postMessage({ id, audio, language: (navigator.language || 'en').split('-')[0] }, [audio.buffer])
  })
}
