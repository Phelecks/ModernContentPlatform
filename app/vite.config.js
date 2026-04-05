import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { cpSync, existsSync } from 'node:fs'

export default defineConfig({
  plugins: [
    vue(),
    {
      // Copies the repo-level content/ tree into dist/content after each build
      // so that /content/topics/… static files are served by Cloudflare Pages.
      name: 'copy-content-dir',
      closeBundle() {
        const src = fileURLToPath(new URL('../content', import.meta.url))
        const dest = fileURLToPath(new URL('./dist/content', import.meta.url))
        if (existsSync(src)) {
          cpSync(src, dest, { recursive: true })
        }
      }
    }
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    outDir: 'dist'
  }
})
