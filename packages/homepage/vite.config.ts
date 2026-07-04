import { readFileSync } from 'fs'
import { defineConfig, type PluginOption, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

import { DOC_NAV } from './src/pages/docs/components/docs-sidebar/data/list'

// Версия библиотеки подтягивается напрямую из пакета synapse-storage —
// единый источник правды, чтобы шапка сайта не расходилась с релизом.
const synapseVersion = JSON.parse(readFileSync(path.resolve(__dirname, '../synapse/package.json'), 'utf-8')).version

// ssgOptions добавляет vite-react-ssg поверх стандартного UserConfig.
type SsgUserConfig = UserConfig & {
  ssgOptions?: {
    dirStyle?: 'flat' | 'nested'
    formatting?: 'minify' | 'prettify' | 'none'
    includedRoutes?: (paths: string[], routes: unknown[]) => string[] | Promise<string[]>
  }
}

// Все пути документации для пререндера: /docs/<key> на каждый раздел навигации.
const docsRoutes = DOC_NAV.flatMap((pillar) => pillar.groups)
  .flatMap((group) => group.items)
  .map((item) => `/docs/${item.key}`)

const config: SsgUserConfig = {
  publicDir: 'public',
  plugins: [react()] as unknown as PluginOption[],
  ssgOptions: {
    dirStyle: 'nested',
    formatting: 'minify',
    // Явно перечисляем, что пререндерить: главная, индекс доков и каждый раздел.
    includedRoutes: () => Array.from(new Set(['/', '/docs', ...docsRoutes])),
  },
  ssr: {
    // Бандлим эти пакеты в SSR-сборку, а не оставляем внешними: react-syntax-highlighter
    // импортирует языки highlight.js без расширений (`.../bash`), и нативный ESM Node
    // такие пути не резолвит. Через бандл их разруливает резолвер vite.
    noExternal: ['react-syntax-highlighter'],
  },
  define: {
    __APP_VERSION__: JSON.stringify(synapseVersion),
  },
  resolve: {
    alias: {
      '@data': path.resolve(__dirname, './src/data'),
      '@i18n': path.resolve(__dirname, './src/i18n'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@router': path.resolve(__dirname, './src/router'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@models': path.resolve(__dirname, './src/types')
    }
  },
  css: {
    modules: {
      generateScopedName: '[name]__[local]__[hash:base64:5]'
    }
  },
  server: {
    port: 3000,
    open: true
  },
  build: {
    // =================== ОСНОВНЫЕ НАСТРОЙКИ BUILD ===================
    outDir: 'build',
    assetsDir: 'assets',
    sourcemap: false,
    target: 'ES2022',
    emptyOutDir: true,

    // =================== РАЗМЕРЫ И ПРЕДУПРЕЖДЕНИЯ ===================
    chunkSizeWarningLimit: 500,
    reportCompressedSize: true,

    // =================== CSS И СТАТИКА ===================
    cssCodeSplit: true,
    cssMinify: true,
    manifest: false,

    // =================== МИНИФИКАЦИЯ ===================
    minify: 'esbuild', // 'esbuild' | 'terser' | false

    // =================== ROLLUP НАСТРОЙКИ ===================
    rollupOptions: {
      output: {
        // Именование файлов
        entryFileNames: 'js/[name]-[hash].js',
        chunkFileNames: 'js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const extType = assetInfo.name?.split('.').pop() || ''
          if (['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(extType)) {
            return 'images/[name]-[hash][extname]'
          }
          if (extType === 'css') {
            return 'css/[name]-[hash][extname]'
          }
          return 'assets/[name]-[hash][extname]'
        },

        // Разделение чанков. Функция-форма (а не объект): при SSR-сборке
        // vite-react-ssg делает react/react-dom внешними, и объектная форма
        // manualChunks на внешних модулях падает. Функция же просто не матчит
        // внешние модули — работает и для клиентской, и для серверной сборки.
        manualChunks: (id: string) => {
          if (id.includes('/node_modules/react-router')) return 'router'
          if (id.includes('/node_modules/react-dom/') || id.includes('/node_modules/react/')) return 'vendor'
          if (id.includes('/node_modules/i18next') || id.includes('/node_modules/react-i18next')) return 'i18n'
          if (id.includes('/node_modules/gray-matter') || id.includes('/node_modules/remark')) return 'utils'
        }
      }
    }
  },

  // =================== ESBUILD НАСТРОЙКИ (НА ВЕРХНЕМ УРОВНЕ!) ===================
  esbuild: {
    // Удаление кода
    drop: ['console', 'debugger'],

    // JSX
    jsx: 'automatic',
    jsxDev: false,

    // Define - замены времени сборки
    define: {
      'process.env.NODE_ENV': '"production"',
      '__DEV__': 'false',
      '__VERSION__': '"1.0.0"'
    },

    // Поддержка функций
    supported: {
      'dynamic-import': true,
      'import-meta': true,
      'bigint': true,
      'top-level-await': true
    },

    // Комментарии
    legalComments: 'none'
  }
}

export default defineConfig(config)
