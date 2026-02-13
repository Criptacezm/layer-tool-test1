import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: './layer.html'
    }
  },
  server: {
    port: 3000,
    open: true
  }
})
