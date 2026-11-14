/// <reference lib="webworker" />
import { env, pipeline } from '@huggingface/transformers'

/**
 * On-device speech recognition with OpenAI's Whisper (tiny, base or small, your choice in the Lab).
 * Runs in a worker so the browser stays responsive. The model downloads once from
 * Hugging Face and is cached; audio never leaves the computer.
 */
env.allowLocalModels = false

type Transcriber = (audio: Float32Array, options: Record<string, unknown>) => Promise<{ text: string } | { text: string }[]>
type Size = 'tiny' | 'base' | 'small'
let loading: Promise<Transcriber> | null = null
let loaded: Size | null = null

const progress = (p: { status: string; file?: string; loaded?: number; total?: number }): void => {
  if (p.status === 'progress' && p.file && p.total) postMessage({ type: 'progress', file: p.file, loaded: p.loaded ?? 0, total: p.total })
}

async function hasGpu(): Promise<boolean> {
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
    return !!(gpu && (await gpu.requestAdapter()))
  } catch {
    return false
  }
}

/** Loads the chosen Whisper size, on the graphics card when there is one. */
function load(size: Size): Promise<Transcriber> {
  if (loading && loaded === size) return loading
  loaded = size
  const model = `Xenova/whisper-${size}`
  loading = (async () => {
    if (await hasGpu()) {
      try {
        return (await pipeline('automatic-speech-recognition', model, { dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' }, device: 'webgpu', progress_callback: progress })) as unknown as Transcriber
      } catch {
        /* fall back to the processor */
      }
    }
    return (await pipeline('automatic-speech-recognition', model, { dtype: 'q8', device: 'wasm', progress_callback: progress })) as unknown as Transcriber
  })()
  return loading
}

self.onmessage = async (e: MessageEvent<{ id: number; audio?: Float32Array; language?: string; warm?: boolean; model?: Size }>) => {
  const { id, audio, language, warm, model = 'small' } = e.data
  try {
    const asr = await load(model)
    if (warm || !audio) return postMessage({ type: 'ready', id })
    const out = await asr(audio, { language, task: 'transcribe', chunk_length_s: 30 })
    const text = (Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text).trim()
    postMessage({ type: 'done', id, text })
  } catch (err) {
    loading = null
    postMessage({ type: 'error', id, message: err instanceof Error ? err.message : String(err) })
  }
}
