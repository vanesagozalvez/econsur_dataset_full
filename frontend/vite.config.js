import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  // En desarrollo, proxy las llamadas /api al backend Python
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      }
    }
  },
  // El build se genera en backend/static/ directamente
  build: {
    outDir: resolve(__dirname, '../backend/static'),
    emptyOutDir: true,
  }
})
