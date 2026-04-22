import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true }
    }
  },
  build: {
    outDir: resolve(__dirname, '../backend/static'),
    emptyOutDir: true,
    rollupOptions: {
      // Plotly se carga desde CDN — no se incluye en el bundle
      external: ['plotly.js-dist-min'],
      output: {
        globals: {
          'plotly.js-dist-min': 'Plotly'
        }
      }
    }
  }
})
