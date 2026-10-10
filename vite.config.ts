import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import { createApiHandler } from './server/api'
import { loadConfig } from './server/config'

/** In development the same proxy handler used in production is mounted on the Vite server. */
function llmProxy(env: Record<string, string>): Plugin {
  return {
    name: 'resume-ai-llm-proxy',
    async configureServer(server) {
      const { handle } = await createApiHandler(loadConfig(env))
      server.middlewares.use((req, res, next) => {
        handle(req, res).then((handled) => (handled ? undefined : next()), next)
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // Load ALL variables (not just VITE_*) for the server-side proxy only; they are never exposed to the client bundle.
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), llmProxy(env)],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    build: { chunkSizeWarningLimit: 1500 },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      testTimeout: 30000,
    },
  }
})
