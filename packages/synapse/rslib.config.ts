import { defineConfig } from '@rslib/core'

export default defineConfig({
  lib: [
    {
      format: 'esm',
      bundle: false,
      dts: {
        bundle: false,
      },
      output: {
        minify: false,
        sourceMap: {
          js: 'source-map',
        },
      },
    },
  ],
  source: {
    entry: {
      // Исключаем тесты из сборки — иначе rslib подхватит src/**/__tests__/*.test.ts
      // (с импортами vitest) в dist.
      index: ['./src/**/*.{ts,tsx}', '!./src/**/__tests__/**'],
    },
  },
  output: {
    target: 'web',
    cleanDistPath: true,
    externals: ['react', 'react-dom', 'rxjs', /^rxjs\//],
  },
  tools: {
    // Без этого SWC собирает JSX в классический рантайм (React.createElement /
    // React.Fragment), а файлы импортируют только именованные хуки из 'react' →
    // в браузере падает `ReferenceError: React is not defined`. Переключаем на
    // автоматический рантайм (react/jsx-runtime), как и заявлено в tsconfig.
    swc: {
      jsc: {
        transform: {
          react: {
            runtime: 'automatic',
          },
        },
      },
    },
  },
})
