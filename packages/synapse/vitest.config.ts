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
    // Type-level тесты (`*.test-d.ts`) — гейтят вывод генериков/инференс через компилятор.
    typecheck: {
      enabled: true,
      tsconfig: './tsconfig.json',
      include: ['src/**/__tests__/**/*.test-d.ts'],
    },
    coverage: {
      provider: 'v8',
      // Модули, чьё поведение зафиксировано тестами. Вне-scope (storage middlewares,
      // broadcast/plugin, createEventBus, useStorage*) пока не входят.
      // api/ добавлен в 6.2.0 после аудита: его отсутствие здесь скрывало непокрытые пути ошибок.
      include: [
        'src/api/**',
        'src/reactive/effects/operators/**',
        'src/react/hooks/useApiQuery.ts',
        'src/react/hooks/useApiMutation.ts',
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
      exclude: ['**/__tests__/**', '**/*.interface.ts', '**/index.ts', 'src/**/example.ts', 'src/utils/createSynapse/types.ts', 'src/api/example.ts'],
      reporter: ['text-summary'],
    },
  },
})
