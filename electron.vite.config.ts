import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const DEV_PORT = 43160

/**
 * The CSP in index.html is the strict production policy. The dev server
 * additionally needs a websocket back to Vite for HMR, so we widen
 * `connect-src` during `electron-vite dev` only.
 */
function devCsp(): Plugin {
  return {
    name: 'dev-csp',
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace(
        "connect-src 'self'",
        `connect-src 'self' ws://localhost:${DEV_PORT} http://localhost:${DEV_PORT}`
      )
    },
  }
}

const sharedAlias = {
  '@shared': resolve(__dirname, 'src/shared'),
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAlias },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAlias },
  },
  renderer: {
    plugins: [vue(), tailwindcss(), devCsp()],
    resolve: { alias: sharedAlias },
    server: {
      port: DEV_PORT,
      strictPort: true,
    },
  },
})
