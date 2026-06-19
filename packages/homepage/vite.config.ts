import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  publicDir: 'public',
  plugins: [react()],
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

        // Разделение чанков
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom'],
          i18n: ['i18next', 'react-i18next'],
          utils: ['gray-matter', 'remark', 'remark-gfm']
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
})
