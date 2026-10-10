export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  /** Ask the provider for JSON-only output. */
  json?: boolean
  temperature?: number
  signal?: AbortSignal
}

export type LlmErrorKind = 'unreachable' | 'model-missing' | 'http' | 'aborted' | 'invalid-json'

export class LlmError extends Error {
  readonly kind: LlmErrorKind
  constructor(kind: LlmErrorKind, message: string) {
    super(message)
    this.name = 'LlmError'
    this.kind = kind
  }
}

export interface ConnectionStatus {
  ok: boolean
  models: string[]
  /** Friendly explanation when `ok` is false, or a warning such as a missing model. */
  message: string
}

/** The only surface the app uses to talk to a model. Implement this to swap providers. */
export interface LlmClient {
  /** Single complete response. */
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>
  /** Streams tokens to `onToken` and resolves with the full text. */
  stream(messages: ChatMessage[], onToken: (token: string) => void, options?: ChatOptions): Promise<string>
  testConnection(): Promise<ConnectionStatus>
}
