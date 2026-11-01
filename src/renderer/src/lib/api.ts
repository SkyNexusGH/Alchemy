/* eslint-disable @typescript-eslint/no-explicit-any */
interface OvyraBridge {
  invoke<T = any>(channel: string, ...args: unknown[]): Promise<T>
  on(channel: string, fn: (...args: any[]) => void): () => void
}

declare global {
  interface Window {
    ovyra: OvyraBridge
  }
}

export const api: OvyraBridge = window.ovyra
