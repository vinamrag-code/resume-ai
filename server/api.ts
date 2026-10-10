import type { IncomingMessage, ServerResponse } from 'node:http'
import { createAuthHandler } from './auth'
import type { ServerConfig } from './config'
import { createLlmHandler } from './proxy'
import { createStore } from './store'
import type { SyncStore } from './store'
import { createSyncHandler } from './sync'

export type ApiHandler = (req: IncomingMessage, res: ServerResponse) => Promise<boolean>

/** All /api routes (auth, cloud sync, AI proxy) as one handler. Returns true when the request was handled. */
export async function createApiHandler(cfg: ServerConfig, store?: SyncStore, deps: { llmFetch?: (url: string, init: RequestInit) => Promise<Response> } = {}): Promise<{ handle: ApiHandler; store: SyncStore }> {
  const syncStore = store ?? (await createStore(cfg))
  const handlers = [createAuthHandler(cfg), createSyncHandler(cfg, syncStore), createLlmHandler(cfg, deps.llmFetch)]
  const handle: ApiHandler = async (req, res) => {
    try {
      for (const h of handlers) if (await h(req, res)) return true
    } catch {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' })
      if (!res.writableEnded) res.end(JSON.stringify({ error: { message: 'Server error.' } }))
      return true
    }
    return false
  }
  return { handle, store: syncStore }
}
