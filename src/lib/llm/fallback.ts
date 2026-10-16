import { LlmError } from './types'
import type { ChatMessage, ChatOptions, ConnectionStatus, LlmClient } from './types'

/** Errors worth retrying on the next provider. Cancellation is never retried. */
const RETRYABLE = new Set(['unreachable', 'rate-limit', 'http', 'model-missing', 'auth'])

/** Tries each client in order; moves on when one fails with a provider-side error. */
export class FallbackClient implements LlmClient {
  constructor(private readonly clients: LlmClient[]) {}

  private empty(): LlmError {
    return new LlmError('auth', 'No AI provider is available. The server needs a Groq, OpenRouter or Inception API key (GROQ_API_KEY / OPENROUTER_API_KEY / INCEPTION_API_KEY).')
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    let last: unknown = this.empty()
    for (const c of this.clients) {
      try {
        return await c.chat(messages, options)
      } catch (err) {
        if (!(err instanceof LlmError) || !RETRYABLE.has(err.kind)) throw err
        last = err
      }
    }
    throw last
  }

  async stream(messages: ChatMessage[], onToken: (token: string) => void, options?: ChatOptions): Promise<string> {
    let last: unknown = this.empty()
    for (const c of this.clients) {
      let started = false
      try {
        return await c.stream(messages, (t) => { started = true; onToken(t) }, options)
      } catch (err) {
        // Once text has reached the user we cannot switch providers mid-answer.
        if (started || !(err instanceof LlmError) || !RETRYABLE.has(err.kind)) throw err
        last = err
      }
    }
    throw last
  }

  async testConnection(): Promise<ConnectionStatus> {
    if (this.clients.length === 0) return { ok: false, models: [], message: this.empty().message }
    const results = await Promise.all(this.clients.map((c) => c.testConnection()))
    return { ok: results.some((r) => r.ok), models: results.flatMap((r) => r.models), message: results.map((r) => r.message).join(' ') }
  }
}
