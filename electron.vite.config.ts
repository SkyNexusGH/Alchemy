import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const alias = { '@shared': resolve(__dirname, 'src/shared') }

export default defineConfig({
  main: { resolve: { alias } },
  preload: {
    resolve: { alias },
    build: {
      // Sandboxed preloads can't require() from node_modules, so this gets bundled in.
      externalizeDeps: { exclude: ['electron-chrome-extensions'] },
      rollupOptions: {
        input: {
          // UI bridge for ovyra:// pages
          index: resolve(__dirname, 'src/preload/index.ts'),
          // Fingerprinting protection and the video popout button, in every frame
          frame: resolve(__dirname, 'src/preload/frame.ts')
        }
      }
    }
  },
  renderer: {
    resolve: { alias },
    plugins: [react()],
    // The UI is loaded through ovyra://, so the HMR client can't infer the dev server address.
    server: { port: 5199, strictPort: true, hmr: { host: 'localhost', protocol: 'ws', clientPort: 5199 } }
  }
})
