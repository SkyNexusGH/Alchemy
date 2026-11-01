type RGB = [number, number, number]

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h.padEnd(6, '0')
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) || 0) as RGB
}

function toHex([r, g, b]: RGB): string {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`
}

function luminance([r, g, b]: RGB): number {
  const f = (v: number): number => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(hexToRgb(a)), luminance(hexToRgb(b))].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

/** Text color to put on top of an accent-filled surface. */
export function inkOn(accent: string): string {
  return luminance(hexToRgb(accent)) > 0.42 ? '#090e17' : '#ffffff'
}

/**
 * The accent, nudged (only as much as needed) so it's still visible as an icon or
 * outline on the background — e.g. a cream accent becomes a warm tan on light mode.
 */
export function readableOn(accent: string, background: string, min = 2.6): string {
  if (contrast(accent, background) >= min) return accent
  const target: RGB = luminance(hexToRgb(background)) > 0.4 ? [9, 14, 23] : [255, 255, 255]
  const base = hexToRgb(accent)
  for (let t = 0.05; t <= 1; t += 0.05) {
    const c = toHex(mix(base, target, t))
    if (contrast(c, background) >= min) return c
  }
  return toHex(target)
}
