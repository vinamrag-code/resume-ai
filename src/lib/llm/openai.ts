import { LlmError } from './types'
import type { ChatMessage, ChatOptions, ConnectionStatus, LlmClient } from './types'

export interface OpenAiConfig {
  baseUrl: string
  model: string
  apiKey: string
  label: string
  supportsJsonFormat: boolean
}

const JSON_HINT = 'Reply with ONLY a single valid JSON value. No markdown fences, no commentary.'

/** Client for any OpenAI-compatible /chat/completions API (OpenRouter, Groq, ...). */
export class OpenAiCompatibleClient implements LlmClient {
  constructor(private readonly config: OpenAiConfig) {}

  private async request(path: string, init: RequestInit): Promise<Response> {
    if (!this.config.apiKey) {
      throw new LlmError('auth', `No ${this.config.label} API key found. Add it to the .env file (see .env.example) and restart the dev server.`)
    }
    let res: Response
    try {
      res = await fetch(`${this.config.baseUrl.replace(/\/+$/, '')}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.config.apiKey}`, ...init.headers },
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw new LlmError('aborted', 'Request cancelled.')
      throw new LlmError('unreachable', `Could not reach ${this.config.label}. Check your internet connection.`)
    }
    if (res.ok) return res
    const body = (await res.text().catch(() => '')).slice(0, 300)
    if (res.status === 401 || res.status === 403) throw new LlmError('auth', `${this.config.label} rejected the API key. Check it in your .env file.`)
    if (res.status === 429) throw new LlmError('rate-limit', `${this.config.label} rate limit reached (free models are limited). Wait a minute or pick another model.`)
    if (res.status === 404) throw new LlmError('model-missing', `Model "${this.config.model}" was not found on ${this.config.label}. Pick another model in Settings.`)
    throw new LlmError('http', `${this.config.label} returned ${res.status}${body ? `: ${body}` : ''}`)
  }

  private body(messages: ChatMessage[], stream: boolean, options?: ChatOptions): string {
    const msgs = options?.json ? [{ role: 'system', content: JSON_HINT }, ...messages] : messages
    return JSON.stringify({
      model: this.config.model,
      messages: msgs,
      stream,
      temperature: options?.temperature ?? 0.3,
      ...(options?.json && this.config.supportsJsonFormat ? { response_format: { type: 'json_object' } } : {}),
    })
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    const res = await this.request('/chat/completions', { method: 'POST', body: this.body(messages, false, options), signal: options?.signal })
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } }
    if (data.error) throw new LlmError('http', data.error.message ?? 'The provider returned an error.')
    return data.choices?.[0]?.message?.content ?? ''
  }

  async stream(messages: ChatMessage[], onToken: (token: string) => void, options?: ChatOptions): Promise<string> {
    const res = await this.request('/chat/completions', { method: 'POST', body: this.body(messages, true, options), signal: options?.signal })
    if (!res.body) throw new LlmError('http', 'The provider sent an empty response.')
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let full = ''
    const handle = (line: string) => {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) return // also skips ": OPENROUTER PROCESSING" comments
      const payload = trimmed.slice(5).trim()
      if (!payload || payload === '[DONE]') return
      const chunk = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[]; error?: { message?: string } }
      if (chunk.error) throw new LlmError('http', chunk.error.message ?? 'The provider returned an error.')
      const token = chunk.choices?.[0]?.delta?.content ?? ''
      if (token) {
        full += token
        onToken(token)
      }
    }
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        lines.forEach(handle)
      }
      handle(buffer)
    } catch (err) {
      if (err instanceof LlmError) throw err
      if (err instanceof DOMException && err.name === 'AbortError') throw new LlmError('aborted', 'Request cancelled.')
      throw new LlmError('http', `The connection to ${this.config.label} was interrupted.`)
    }
    return full
  }

  async testConnection(): Promise<ConnectionStatus> {
    try {
      await this.chat([{ role: 'user', content: 'Reply with the single word: ok' }], { temperature: 0 })
      return { ok: true, models: [this.config.model], message: `Connected to ${this.config.label}. Model "${this.config.model}" responded.` }
    } catch (err) {
      return { ok: false, models: [], message: err instanceof Error ? err.message : 'Connection failed.' }
    }
  }
}
