import { nativeTheme } from 'electron'
import { getSettings } from './settings'

/**
 * DevTools open docked inside the window, restyled to match Alchemy: the same base
 * colors, the accent for selections and highlights, and the same font. DevTools builds
 * its colors from --sys-color-* variables, which reach into all of its panels.
 */
export function devtoolsCss(): string {
  const dark = nativeTheme.shouldUseDarkColors
  const accent = getSettings().appearance.accent
  const c = dark
    ? {
        base: '#0c121d',
        container: '#111826',
        surface: '#131b2a',
        surface2: '#1a2334',
        text: '#e6e9f0',
        text2: '#a9b0bf',
        divider: 'rgba(230, 233, 240, 0.09)',
        hover: 'rgba(230, 233, 240, 0.06)'
      }
    : {
        base: '#f3f4f8',
        container: '#e9ecf2',
        surface: '#ffffff',
        surface2: '#e6e9ef',
        text: '#090e17',
        text2: '#4a5263',
        divider: 'rgba(9, 14, 23, 0.1)',
        hover: 'rgba(9, 14, 23, 0.05)'
      }
  return `
    :root, :root.theme-with-dark-background, .theme-with-dark-background, :host {
      --sys-color-cdt-base: ${c.base} !important;
      --sys-color-cdt-base-container: ${c.base} !important;
      --sys-color-base: ${c.base} !important;
      --sys-color-base-container: ${c.container} !important;
      --sys-color-base-container-elevated: ${c.surface} !important;
      --sys-color-surface: ${c.surface} !important;
      --sys-color-surface1: ${c.container} !important;
      --sys-color-surface2: ${c.surface} !important;
      --sys-color-surface3: ${c.surface2} !important;
      --sys-color-surface4: ${c.surface2} !important;
      --sys-color-surface5: ${c.surface2} !important;
      --sys-color-header-container: ${c.container} !important;
      --sys-color-on-surface: ${c.text} !important;
      --sys-color-on-surface-subtle: ${c.text2} !important;
      --sys-color-divider: ${c.divider} !important;
      --sys-color-neutral-outline: ${c.divider} !important;
      --sys-color-state-hover-on-subtle: ${c.hover} !important;
      --sys-color-primary: ${accent} !important;
      --sys-color-primary-bright: ${accent} !important;
      --sys-color-tonal-container: color-mix(in srgb, ${accent} 22%, transparent) !important;
      --sys-color-state-focus-select: color-mix(in srgb, ${accent} 24%, transparent) !important;
      --sys-color-state-focus-highlight: color-mix(in srgb, ${accent} 16%, transparent) !important;
      --sys-color-tonal-outline: ${accent} !important;
      --sys-color-state-ripple-primary: color-mix(in srgb, ${accent} 30%, transparent) !important;
      --default-font-family: 'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif !important;
    }
    body { background: ${c.base} !important; }
  `
}
