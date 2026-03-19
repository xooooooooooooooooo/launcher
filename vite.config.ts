import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import path from 'path'

export default defineConfig(({ mode }) => ({
  plugins: [
    react()
  ],
  
  // Important: Use relative paths for production builds
  base: mode === 'production' ? './' : '/',
  
  // Dev server configuration
  server: {
    port: 5173,
    strictPort: true,
  },
  
  // Build configuration
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html')
      }
    }
  },
  
  // Path aliases
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
}))
