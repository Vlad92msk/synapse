import { defineConfig } from 'tsup'

export default defineConfig([
  // =================== COMMONJS КОНФИГУРАЦИЯ ===================
  // CJS хорошо работает с bundle: true и включает зависимости в бандл
  // Используется в Node.js проектах и legacy окружениях
  {
    entry: {
      index: 'src/index.ts',
      core: 'src/core/index.ts',
      reactive: 'src/reactive/index.ts',
      api: 'src/api/index.ts',
      react: 'src/react/index.ts',
      utils: 'src/utils/index.ts'
    },

    // =================== БАЗОВЫЕ НАСТРОЙКИ ===================
    format: ['cjs'],                 // Только CommonJS
    dts: false,                      // Типы генерируем только для ESM
    splitting: false,                // CJS не поддерживает splitting
    sourcemap: false,                // Убираем source maps
    clean: false,                    // Не очищаем (ESM очистит)
    minify: false,                   // Можно включить для продакшена
    bundle: true,                    // ✅ CJS бандлит зависимости
    target: 'es2022',                // Современный JS
    platform: 'node',               // CJS обычно для Node.js

    // =================== ЗАВИСИМОСТИ ===================
    external: [
      'react',                       // Основные peer dependencies
      'react-dom',
      'rxjs'
    ],

    // =================== РАСШИРЕНИЯ ФАЙЛОВ ===================
    // @ts-ignore - временно игнорируем типы tsup
    outExtension: () => ({ '.js': '.cjs' }) // .js → .cjs
  },

  // =================== ESM КОНФИГУРАЦИЯ ===================
  // ESM с bundle: false - современный подход для библиотек
  // Сохраняет импорты как есть, минимальный размер файлов
  {
    entry: {
      index: 'src/index.ts',
      core: 'src/core/index.ts',
      reactive: 'src/reactive/index.ts',
      api: 'src/api/index.ts',
      react: 'src/react/index.ts',
      utils: 'src/utils/index.ts'
    },

    // =================== БАЗОВЫЕ НАСТРОЙКИ ===================
    format: ['esm'],                 // Только ES modules
    dts: true,                       // ✅ Генерируем типы для ESM
    splitting: false,                // Отключено для stable external
    sourcemap: false,                // Убираем source maps
    clean: true,                     // ✅ Очищаем dist перед сборкой
    minify: false,                   // Можно включить для продакшена
    bundle: false,                   // ✅ НЕ бандлим - сохраняем импорты
    target: 'es2022',                // Современный JS
    platform: 'neutral',            // Универсальная платформа

    // =================== ЗАВИСИМОСТИ ===================
    // При bundle: false external работает надежно
    external: [
      'react',                       // Основные peer dependencies
      'react-dom',
      'rxjs'
    ],

    // =================== ESBUILD НАСТРОЙКИ ===================
    esbuildOptions: (options) => {
      options.jsx = 'automatic'      // Современный JSX transform
      options.jsxDev = false         // Продакшен JSX
    },

    // =================== ПРОВЕРКА РЕЗУЛЬТАТА ===================
    onSuccess: async () => {
      console.log('✅ ESM build completed!')

      // Проверяем что external зависимости не попали в бандл
      const fs = await import('fs')
      const files = fs.readdirSync('./dist')
      const esmFiles = files.filter(f => f.endsWith('.js') && !f.endsWith('.cjs'))

      let allGood = true

      for (const file of esmFiles) {
        const content = fs.readFileSync(`./dist/${file}`, 'utf8')

        // Проверяем что React остался как импорт, а не как код
        if (content.includes('function useState') || content.includes('useState:')) {
          console.error(`❌ React CODE found in ${file}`)
          allGood = false
        } else if (content.includes('import {useState') || content.includes('import{useState')) {
          console.log(`✅ ${file}: React import found (good - external)`)
        } else {
          console.log(`✅ ${file}: No React`)
        }
      }

      if (allGood) {
        console.log('🎉 SUCCESS: All ESM files use external React imports!')
      }
    }
  }

  // =================== ДОПОЛНИТЕЛЬНЫЕ НАСТРОЙКИ ===================
  // Раскомментируйте для продакшена:

  // minify: true,                    // Минификация
  // treeshake: true,                 // Удаление неиспользуемого кода
  // sourcemap: true,                 // Source maps для отладки

  // =================== ПРОДВИНУТЫЕ НАСТРОЙКИ ===================

  // splitting: true,                 // Только для bundle: true
  // metafile: true,                  // Анализ бандла
  //
  // esbuildOptions: (options) => {
  //   options.drop = ['console', 'debugger'] // Убираем логи
  //   options.mangleProps = /^_/     // Сжимаем приватные свойства
  // }

  // =================== МОНИТОРИНГ ===================

  // watch: true,                     // Режим разработки
  // onSuccess: 'echo "Build done!"' // Команда после сборки
])
