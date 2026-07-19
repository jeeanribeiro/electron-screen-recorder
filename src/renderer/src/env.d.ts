/// <reference types="vite/client" />

import type { RendererApi } from '@shared/api'

declare global {
  interface Window {
    /** Typed IPC bridge exposed by the sandboxed preload script. */
    api: RendererApi
  }
}

export {}
