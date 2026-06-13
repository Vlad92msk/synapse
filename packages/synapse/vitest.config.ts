import { defineConfig } from 'vitest/config'

/**
 * Конфиг тестов synapse-storage.
 *
 * Среда по умолчанию — node. Файлы, которым нужен браузерный API
 * (localStorage, DOM для React), переключаются на jsdom через docblock-комментарий
 * `// @vitest-environment jsdom` в начале файла. IndexedDB во всех средах даёт
 * `fake-indexeddb/auto` (импортируется в самом тесте).
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      // «Ядро» этапа 0: модули, чьё текущее поведение зафиксировано страховочными тестами.
      // Вне-scope (api/, storage middlewares, broadcast/plugin, createEventBus,
      // useStorage*) сюда намеренно не входят — их покрытие появится на следующих этапах.
      include: [
        'src/core/storage/adapters/**',
        'src/core/selector/selector.module.ts',
        'src/reactive/dispatcher/dispatcher.module.ts',
        'src/reactive/dispatcher/standalone.ts',
        'src/reactive/effects/effects.module.ts',
        'src/reactive/effects/utils/**',
        'src/utils/createSynapse/**',
        'src/react/hooks/useSelector.ts',
        'src/react/utils/createSynapseCtx.tsx',
      ],
      exclude: ['**/__tests__/**', '**/*.interface.ts', '**/index.ts', 'src/**/example.ts', 'src/utils/createSynapse/types.ts'],
      reporter: ['text-summary'],
    },
  },
})
