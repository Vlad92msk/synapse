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
      index: './src/**/*.{ts,tsx}',
    },
  },
  output: {
    target: 'web',
    cleanDistPath: true,
    externals: ['react', 'react-dom', 'rxjs', /^rxjs\//],
  },
})
