import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const synapseSrc = path.resolve(__dirname, '../synapse/src')

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'synapse-storage/core': path.join(synapseSrc, 'core/index.ts'),
      'synapse-storage/react': path.join(synapseSrc, 'react/index.ts'),
      'synapse-storage/reactive': path.join(synapseSrc, 'reactive/index.ts'),
      'synapse-storage/utils': path.join(synapseSrc, 'utils/index.ts'),
      'synapse-storage/api': path.join(synapseSrc, 'api/index.ts'),
      'synapse-storage': path.join(synapseSrc, 'index.ts'),
    },
  },
})
