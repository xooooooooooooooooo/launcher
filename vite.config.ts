import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
// @ts-expect-error Types are missing for this specific plugin, but the import functions flawlessly
import obfuscator from 'rollup-plugin-javascript-obfuscator'

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    mode === 'production' && obfuscator({
      compact: true,
      controlFlowFlattening: true,
      controlFlowFlatteningThreshold: 0.75,
      deadCodeInjection: true,
      deadCodeInjectionThreshold: 0.4,
      stringArray: true,
      stringArrayEncoding: ['base64'],
      stringArrayThreshold: 0.75,
    })
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
