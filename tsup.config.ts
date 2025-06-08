import { defineConfig } from 'tsup'

export default defineConfig({
  // =================== ENTRY POINTS ===================
  entry: {
    index: 'src/index.ts',
    core: 'src/core/index.ts',
    reactive: 'src/reactive/index.ts',
    api: 'src/api/index.ts',
    react: 'src/react/index.ts',
    utils: 'src/utils/index.ts'
  },

  // =================== ESM ONLY КОНФИГУРАЦИЯ ===================
  format: ['esm'],                   // Только ES modules
  dts: true,                         // Генерируем TypeScript типы
  splitting: false,                  // Отключено для стабильной работы с external
  sourcemap: false,                  // Убираем source maps для продакшена
  clean: true,                       // Очищаем dist перед сборкой
  minify: true,                      // Минификация для меньшего размера
  bundle: true,                      // Бандлим код библиотеки
  target: 'es2022',                  // Современный JavaScript
  platform: 'neutral',              // Универсальная платформа (браузер + Node.js)

  // =================== EXTERNAL ЗАВИСИМОСТИ ===================
  external: [
    'react',                         // React остается внешней зависимостью
    'react-dom',                     // React DOM остается внешней
    'rxjs'                           // RxJS остается внешней
  ],

  // =================== ESBUILD НАСТРОЙКИ ===================
  esbuildOptions: (options) => {
    options.jsx = 'automatic'        // Современный JSX transform
    options.jsxDev = false           // Отключаем dev режим JSX
    options.packages = 'external'    // Принуждаем external зависимости
    options.treeShaking = true
    options.drop = ['console', 'debugger'] // Убираем в продакшене
    options.mangleProps = /^_/ // Сжимаем приватные свойства

    // Дублируем external настройки для надежности
    options.external = [
      'react',
      'react-dom',
      'rxjs'
    ]
  },

  // =================== ПРОВЕРКА КАЧЕСТВА СБОРКИ ===================
  onSuccess: async () => {
    console.log('🚀 ESM-only build completed!')

    // Проверяем что external зависимости не попали в бандл
    const fs = await import('fs')
    const path = await import('path')

    try {
      const files = fs.readdirSync('./dist')
      const jsFiles = files.filter(f => f.endsWith('.js'))

      console.log(`📦 Generated files: ${jsFiles.join(', ')}`)

      let allGood = true
      let totalSize = 0

      for (const file of jsFiles) {
        const filePath = path.join('./dist', file)
        const content = fs.readFileSync(filePath, 'utf8')
        const sizeKB = (content.length / 1024).toFixed(2)
        totalSize += parseFloat(sizeKB)

        // Проверяем что React остался как импорт, а не включен в код
        if (content.includes('function useState') || content.includes('createElement(')) {
          console.error(`❌ React CODE found in ${file} (${sizeKB}KB)`)
          allGood = false
        } else if (content.includes('from"react"') || content.includes('from "react"')) {
          console.log(`✅ ${file} (${sizeKB}KB): External React import ✓`)
        } else {
          console.log(`✅ ${file} (${sizeKB}KB): No React dependency`)
        }

        // Проверяем RxJS
        if (content.includes('from"rxjs"') || content.includes('from "rxjs"')) {
          console.log(`✅ ${file}: External RxJS import ✓`)
        }
      }

      console.log(`📊 Total library size: ${totalSize.toFixed(2)}KB`)

      if (allGood) {
        console.log('🎉 SUCCESS: Clean ESM-only build with external dependencies!')
      } else {
        console.error('💥 FAILED: Some dependencies were bundled instead of staying external')
        process.exit(1)
      }
    } catch (error) {
      // @ts-ignore
      console.warn('⚠️  Could not verify build quality:', error.message)
    }
  },

  // =================== ДОПОЛНИТЕЛЬНЫЕ ОПЦИИ ДЛЯ РАЗРАБОТКИ ===================
  // Раскомментируйте при необходимости:

  // watch: true,                     // Режим наблюдения за изменениями
  // sourcemap: true,                 // Source maps для отладки
  // metafile: true,                  // Метаданные сборки для анализа

  // esbuildOptions: (options) => {
  //   options.drop = ['console']     // Убираем console.log в продакшене
  //   options.treeShaking = true     // Дополнительный tree shaking
  // }
})
