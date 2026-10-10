import { LlmError } from './types'
import type { ChatMessage, ChatOptions, ConnectionStatus, LlmClient } from './types'

export interface OllamaConfig {
  baseUrl: string
  model: string
}

export const OLLAMA_HELP =
  'Could not reach Ollama. Make sure it is running (`ollama serve`) and that OLLAMA_ORIGINS allows this page, then try again.'

const trimUrl = (u: string) => u.trim().replace(/\/+$/, '')

export class OllamaClient implements LlmClient {
  constructor(private readonly config: OllamaConfig) {}

  private async request(path: string, init?: RequestInit): Promise<Response> {
    let res: Response
    try {
      res = await fetch(`${trimUrl(this.config.baseUrl)}${path}`, init)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw new LlmError('aborted', 'Request cancelled.')
      throw new LlmError('unreachable', OLLAMA_HELP)
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      if (res.status === 404 && /model/i.test(body)) {
        throw new LlmError(
          'model-missing',
          `Model "${this.config.model}" is not installed. Run \`ollama pull ${this.config.model}\` or pick another model in Settings.`,
        )
      }
      throw new LlmError('http', `Ollama returned ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`)
    }
    return res
  }

  private body(messages: ChatMessage[], stream: boolean, options?: ChatOptions): string {
    return JSON.stringify({
      model: this.config.model,
      messages,
      stream,
      ...(options?.json ? { format: 'json' } : {}),
      options: { temperature: options?.temperature ?? 0.3 },
    })
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    const res = await this.request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: this.body(messages, false, options),
      signal: options?.signal,
    })
    const data = (await res.json()) as { message?: { content?: string } }
    return data.message?.content ?? ''
  }

  async stream(messages: ChatMessage[], onToken: (token: string) => void, options?: ChatOptions): Promise<string> {
    const res = await this.request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: this.body(messages, true, options),
      signal: options?.signal,
    })
    if (!res.body) throw new LlmError('http', 'Ollama sent an empty response.')
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let full = ''
    const handleLine = (line: string) => {
      if (!line.trim()) return
      const chunk = JSON.parse(line) as { message?: { content?: string }; error?: string }
      if (chunk.error) throw new LlmError('http', chunk.error)
      const token = chunk.message?.content ?? ''
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
        lines.forEach(handleLine)
      }
      handleLine(buffer)
    } catch (err) {
      if (err instanceof LlmError) throw err
      if (err instanceof DOMException && err.name === 'AbortError') throw new LlmError('aborted', 'Request cancelled.')
      throw new LlmError('http', 'The connection to Ollama was interrupted.')
    }
    return full
  }

  async testConnection(): Promise<ConnectionStatus> {
    try {
      const res = await this.request('/api/tags')
      const data = (await res.json()) as { models?: { name: string }[] }
      const models = (data.models ?? []).map((m) => m.name)
      const wanted = this.config.model
      const installed = models.some((m) => m === wanted || m === `${wanted}:latest` || m.split(':')[0] === wanted)
      if (!installed) {
        return {
          ok: false,
          models,
          message: `Connected, but model "${wanted}" is not installed. Run \`ollama pull ${wanted}\` or choose one of the installed models.`,
        }
      }
      return { ok: true, models, message: `Connected. ${models.length} model(s) available.` }
    } catch (err) {
      return { ok: false, models: [], message: err instanceof Error ? err.message : OLLAMA_HELP }
    }
  }
}
