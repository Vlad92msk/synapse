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
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom', 'rxjs']
})
