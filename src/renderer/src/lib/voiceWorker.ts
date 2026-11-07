/// <reference lib="webworker" />
import { env, pipeline } from '@huggingface/transformers'

/**
 * On-device speech recognition with OpenAI's Whisper (the "small" model, for accuracy).
 * Runs in a worker so the browser stays responsive. The model downloads once from
 * Hugging Face and is cached; audio never leaves the computer.
 */
env.allowLocalModels = false

type Transcriber = (audio: Float32Array, options: Record<string, unknown>) => Promise<{ text: string } | { text: string }[]>
let loading: Promise<Transcriber> | null = null

function load(): Promise<Transcriber> {
  loading ??= pipeline('automatic-speech-recognition', 'Xenova/whisper-small', {
    dtype: 'q8',
    device: 'wasm',
    progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status === 'progress' && p.file && p.total) postMessage({ type: 'progress', file: p.file, loaded: p.loaded ?? 0, total: p.total })
    }
  }) as unknown as Promise<Transcriber>
  return loading
}

self.onmessage = async (e: MessageEvent<{ id: number; audio?: Float32Array; language?: string; warm?: boolean }>) => {
  const { id, audio, language, warm } = e.data
  try {
    const asr = await load()
    if (warm || !audio) return postMessage({ type: 'ready', id })
    const out = await asr(audio, { language, task: 'transcribe', chunk_length_s: 30 })
    const text = (Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text).trim()
    postMessage({ type: 'done', id, text })
  } catch (err) {
    loading = null
    postMessage({ type: 'error', id, message: err instanceof Error ? err.message : String(err) })
  }
}
