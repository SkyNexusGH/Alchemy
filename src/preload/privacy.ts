export interface PrivacyConfig {
  farble: boolean
  gpc: boolean
  seed: number
  /** Paste protection. */
  clipboard: boolean
  /** A different, believable device for each site. */
  profile: boolean
}

/**
 * Fingerprinting protection, Brave-style "farbling": readouts that trackers use to
 * identify a device (canvas pixels, audio processing, GPU name) get tiny, invisible
 * per-site noise. Each site sees a stable but different fingerprint, so sites can't
 * link you across the web. Serialized into the page, so it must be self-contained.
 */
export function protect({ farble, gpc, seed, clipboard, profile }: PrivacyConfig): void {
  const define = (obj: object, name: string, fn: (...a: never[]) => unknown): void => {
    const original = (obj as Record<string, unknown>)[name] as object
    const native = Function.prototype.toString.call(original)
    Object.defineProperty(fn, 'name', { value: name })
    Object.defineProperty(fn, 'toString', { value: () => native })
    Object.defineProperty(obj, name, { value: fn, writable: true, configurable: true, enumerable: false })
  }

  if (gpc) {
    try {
      Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true, configurable: true })
    } catch {
      /* already defined */
    }
  }

  // ---- paste protection ---------------------------------------------------------------
  // Two tricks: writing to the clipboard when you didn't click anything, and swapping what
  // you copied for something else (a crypto address or link for one of theirs).
  if (clipboard) {
    const blocked = (): void => void window.dispatchEvent(new Event('__alchemy_clipboard_blocked'))
    const looksSensitive = (t: string): boolean => /^(bc1\w{20,}|[13][a-km-zA-HJ-NP-Z1-9]{25,}|0x[0-9a-fA-F]{30,}|https?:\/\/\S+|[A-Za-z0-9]{30,})$/.test(t.trim())
    const active = (): boolean => (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation?.isActive !== false
    if (window.Clipboard) {
      for (const name of ['writeText', 'write'] as const) {
        const original = Clipboard.prototype[name] as (...a: unknown[]) => Promise<void>
        define(Clipboard.prototype, name, function (this: Clipboard, ...args: never[]) {
          if (!active()) {
            blocked()
            return Promise.reject(new DOMException('Blocked by Alchemy paste protection', 'NotAllowedError'))
          }
          return original.apply(this, args)
        })
      }
    }
    const setData = DataTransfer.prototype.setData
    define(DataTransfer.prototype, 'setData', function (this: DataTransfer, ...args: never[]) {
      const [format, value] = args as unknown as [string, string]
      const selected = document.getSelection()?.toString() ?? ''
      // Only while copying, only when the page replaces something like an address or link.
      if (window.event?.type === 'copy' && /text/i.test(format) && looksSensitive(selected) && String(value).trim() !== selected.trim()) {
        blocked()
        return
      }
      return (setData as (...a: unknown[]) => void).apply(this, args)
    })
  }

  if (!farble) return

  // ---- device profile -------------------------------------------------------------------
  // A believable PC, picked from the site's own seed: stable there, different elsewhere.
  if (profile) {
    const pick = <T,>(list: T[], salt: number): T => list[(Math.imul(seed ^ salt, 2654435761) >>> 0) % list.length]
    const real = { w: screen.width, h: screen.height }
    // Never smaller than the real window, or the numbers wouldn't add up.
    const sizes = [[1366, 768], [1536, 864], [1920, 1080], [2560, 1440]].filter(([w, h]) => w >= window.outerWidth && h >= window.outerHeight)
    const [w, h] = sizes.length ? pick(sizes, 11) : [real.w, real.h]
    const get = (obj: object, name: string, value: unknown): void => {
      try {
        Object.defineProperty(obj, name, { get: () => value, configurable: true })
      } catch {
        /* not changeable here */
      }
    }
    get(Screen.prototype, 'width', w)
    get(Screen.prototype, 'height', h)
    get(Screen.prototype, 'availWidth', w)
    get(Screen.prototype, 'availHeight', h - 40)
    get(Navigator.prototype, 'hardwareConcurrency', pick([4, 6, 8, 12], 23))
    if ('deviceMemory' in navigator) get(Navigator.prototype, 'deviceMemory', pick([4, 8], 37))
  }

  // Deterministic per (site, position): the same canvas reads the same way every time.
  const noise = (i: number): number => Math.imul(seed ^ i, 2654435761) >>> 0
  // Only opaque pixels: canvases store premultiplied alpha, so a change to a
  // (semi-)transparent pixel's color is rounded away when the image is encoded.
  const touch = (data: Uint8ClampedArray): void => {
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] !== 255) continue
      const h = noise(i)
      if ((h & 15) === 0) data[i + ((h >>> 4) % 3)] ^= 1
    }
  }

  // Only 2D canvases get noise; copying a WebGL canvas could blank it.
  const kinds = new WeakMap<HTMLCanvasElement, string>()
  const getContext = HTMLCanvasElement.prototype.getContext
  define(HTMLCanvasElement.prototype, 'getContext', function (this: HTMLCanvasElement, ...args: never[]) {
    const ctx = (getContext as (...a: unknown[]) => unknown).apply(this, args)
    if (ctx && !kinds.has(this)) kinds.set(this, String(args[0]))
    return ctx
  })

  const getImageData = CanvasRenderingContext2D.prototype.getImageData
  define(CanvasRenderingContext2D.prototype, 'getImageData', function (this: CanvasRenderingContext2D, ...args: never[]) {
    const data = (getImageData as (...a: unknown[]) => ImageData).apply(this, args)
    touch(data.data)
    return data
  })

  const noisyCopy = (canvas: HTMLCanvasElement): HTMLCanvasElement => {
    const { width, height } = canvas
    if (kinds.get(canvas) !== '2d' || !width || !height || width * height > 16_000_000) return canvas
    const copy = document.createElement('canvas')
    copy.width = width
    copy.height = height
    const ctx = getContext.call(copy, '2d') as CanvasRenderingContext2D
    ctx.drawImage(canvas, 0, 0)
    const data = getImageData.call(ctx, 0, 0, width, height)
    touch(data.data)
    ctx.putImageData(data, 0, 0)
    return copy
  }
  const toDataURL = HTMLCanvasElement.prototype.toDataURL
  define(HTMLCanvasElement.prototype, 'toDataURL', function (this: HTMLCanvasElement, ...args: never[]) {
    return (toDataURL as (...a: unknown[]) => string).apply(noisyCopy(this), args)
  })
  const toBlob = HTMLCanvasElement.prototype.toBlob
  define(HTMLCanvasElement.prototype, 'toBlob', function (this: HTMLCanvasElement, ...args: never[]) {
    return (toBlob as (...a: unknown[]) => void).apply(noisyCopy(this), args)
  })

  // Hide the exact GPU model.
  for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
    const getParameter = proto.getParameter
    define(proto, 'getParameter', function (this: WebGLRenderingContext, p: never) {
      if (p === 0x9245) return 'Google Inc.'
      if (p === 0x9246) return 'ANGLE (Generic Renderer)'
      return getParameter.call(this, p)
    })
  }

  // Audio fingerprinting reads processed samples; nudge them below audibility.
  const seen = new WeakSet<Float32Array>()
  const getChannelData = AudioBuffer.prototype.getChannelData
  define(AudioBuffer.prototype, 'getChannelData', function (this: AudioBuffer, ...args: never[]) {
    const data = (getChannelData as (...a: unknown[]) => Float32Array).apply(this, args)
    if (!seen.has(data)) {
      seen.add(data)
      for (let i = 0; i < data.length; i += 97) data[i] += (noise(i) / 4294967296 - 0.5) * 1e-7
    }
    return data
  })
  const getFloatFrequencyData = AnalyserNode.prototype.getFloatFrequencyData
  define(AnalyserNode.prototype, 'getFloatFrequencyData', function (this: AnalyserNode, array: never) {
    getFloatFrequencyData.call(this, array)
    const a = array as Float32Array
    for (let i = 0; i < a.length; i += 7) a[i] += (noise(i) / 4294967296 - 0.5) * 1e-4
  })
}
