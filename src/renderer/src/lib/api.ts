/* eslint-disable @typescript-eslint/no-explicit-any */
interface AlchemyBridge {
  invoke<T = any>(channel: string, ...args: unknown[]): Promise<T>
  on(channel: string, fn: (...args: any[]) => void): () => void
}

declare global {
  interface Window {
    ovyra: AlchemyBridge
  }
}

export const api: AlchemyBridge = window.ovyra
