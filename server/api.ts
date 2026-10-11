import type { IncomingMessage, ServerResponse } from 'node:http'
import { createAuthHandler } from './auth'
import type { ServerConfig } from './config'
import { createJobImportHandler } from './jobImport'
import { createModelSource } from './modelConfig'
import { createLlmHandler } from './proxy'

export type ApiHandler = (req: IncomingMessage, res: ServerResponse) => Promise<boolean>

interface Deps {
  llmFetch?: (url: string, init: RequestInit) => Promise<Response>
  /** Fetch used to download Firebase's public signing keys (replaceable in tests). */
  verifyFetch?: (url: string) => Promise<Response>
  /** Fetch used to read the admin's model list from Firestore (replaceable in tests). */
  modelsFetch?: (url: string) => Promise<Response>
  /** Replaceable in tests: is this user an admin? */
  isAdmin?: (uid: string, token: string) => Promise<boolean>
  /** Replaceable in tests: download a job page. */
  fetchPage?: (url: string) => Promise<import('./safeFetch').PageResult>
}

/** All /api routes (auth config and the AI proxy) as one handler. Returns true when the request was handled. */
export function createApiHandler(cfg: ServerConfig, deps: Deps = {}): ApiHandler {
  const handlers = [createAuthHandler(cfg), createJobImportHandler(cfg, { verifyFetch: deps.verifyFetch, fetchPage: deps.fetchPage }), createLlmHandler(cfg, deps.llmFetch, undefined, undefined, { verifyFetch: deps.verifyFetch, models: createModelSource(cfg, deps.modelsFetch), isAdmin: deps.isAdmin })]
  return async (req, res) => {
    try {
      for (const h of handlers) if (await h(req, res)) return true
    } catch {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' })
      if (!res.writableEnded) res.end(JSON.stringify({ error: { message: 'Server error.' } }))
      return true
    }
    return false
  }
}
