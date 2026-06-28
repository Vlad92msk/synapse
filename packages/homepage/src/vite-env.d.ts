/// <reference types="vite/client" />

// Версия synapse-storage, инлайнится Vite (define) из ../synapse/package.json
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string
  // добавьте другие env переменные здесь
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
