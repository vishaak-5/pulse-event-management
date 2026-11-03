/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend address for production builds; empty in development (Vite proxies /api). */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
