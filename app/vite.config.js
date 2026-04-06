import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { cpSync, existsSync, createReadStream, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const CONTENT_MIME = {
  '.json': 'application/json',
  '.md':   'text/markdown; charset=utf-8',
  '.txt':  'text/plain; charset=utf-8'
}

export default defineConfig({
  plugins: [
    vue(),
    {
      // Serves the repo-level content/ tree at /content/… during `npm run dev`
      // so that content.js service calls resolve without a full build.
      name: 'serve-content-dir',
      configureServer(server) {
        const contentDir = fileURLToPath(new URL('../content', import.meta.url))
        server.middlewares.use('/content', (req, res, next) => {
          try {
            const filePath = join(contentDir, decodeURIComponent(req.url ?? ''))
            // Guard against path traversal (dev server safety)
            if (!filePath.startsWith(contentDir + '/') && filePath !== contentDir) {
              next()
              return
            }
            const stat = statSync(filePath)
            if (stat.isFile()) {
              const mime = CONTENT_MIME[extname(filePath)] ?? 'application/octet-stream'
              res.setHeader('Content-Type', mime)
              res.setHeader('Cache-Control', 'no-store')
              createReadStream(filePath).pipe(res)
              return
            }
          } catch {
            // file not found — fall through to Vite's 404 handler
          }
          next()
        })
      }
    },
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
  },
  server: {
    // Proxy /api/* to the local wrangler pages dev server so that
    // `npm run dev` (port 5173) can call Pages Functions without a rebuild.
    // Start wrangler in a second terminal: wrangler pages dev app/dist --d1=DB
    proxy: {
      '/api': {
        target: 'http://localhost:8788',
        changeOrigin: true
      }
    }
  }
})
