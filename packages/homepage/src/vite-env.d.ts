/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string
  // добавьте другие env переменные здесь
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
