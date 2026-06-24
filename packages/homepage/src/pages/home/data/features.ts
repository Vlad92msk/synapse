interface Feature {
  key: string
}

// Сквозные особенности (то, что относится ко всем 3 блокам сразу).
// Сами блоки — хранилища / API / бизнес-логика — вынесены в секцию столпов.
export const FEATURES: Feature[] = [
  { key: 'homepage.features.frameworkAgnostic' },
  { key: 'homepage.features.typescript' },
  { key: 'homepage.features.storageChoice' },
  { key: 'homepage.features.middlewares' },
  { key: 'homepage.features.broadcast' },
  { key: 'homepage.features.ssr' },
]
