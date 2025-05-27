import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    core: 'src/core/index.ts',
    reactive: 'src/reactive/index.ts',
    api: 'src/api/index.ts',
    react: 'src/react/index.ts',
    utils: 'src/utils/index.ts'
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: true,        // ✅ Выносит общий код в chunks
  sourcemap: false,       // ✅ Убираем source maps для npm пакета
  clean: true,
  minify: true,          // ✅ Минификация
  treeshake: true,       // ✅ Убираем неиспользуемый код
  external: ['rxjs', 'react', 'react-dom'],    // ✅ Внешние зависимости
  bundle: true,          // ✅ Бандлим все импорты
  target: 'es2022',      // ✅ Более современный таргет

  // Настройки для уменьшения размера
  esbuildOptions: (options) => {
    options.mangleProps = /^_/  // Сжимаем приватные свойства
    options.drop = ['console', 'debugger']  // Убираем console.log
  },

  // Исключаем из бандла
  noExternal: [],

  // Оптимизация для библиотек
  platform: 'neutral'
})
