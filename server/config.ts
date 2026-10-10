export type Provider = 'groq' | 'openrouter'

export interface ServerConfig {
  port: number
  keys: Record<Provider, string>
  /** Models clients may request, per provider. Anything else is rejected so nobody can pick expensive models. */
  allowedModels: Record<Provider, string[]>
  perMinute: number
  perDay: number
  /** Trust X-Forwarded-For (set when running behind a platform proxy such as Render). */
  trustProxy: boolean
  staticDir: string
  maxBodyBytes: number
  maxMessages: number
  maxChars: number
  maxTokens: number
  /** Google OAuth client ID. When set, AI features and cloud sync require sign-in. */
  googleClientId: string
  /** Secret used to sign session cookies (at least 32 characters). */
  sessionSecret: string
  sessionDays: number
  /** Per signed-in user limits (replace the per-IP limits for signed-in requests). */
  userPerMinute: number
  userPerDay: number
  databaseUrl: string
  dataDir: string
  maxSyncBytes: number
}

/** Auth is on only when both the client ID and a strong session secret are configured. */
export const authEnabled = (cfg: Pick<ServerConfig, 'googleClientId' | 'sessionSecret'>): boolean => !!cfg.googleClientId && cfg.sessionSecret.length >= 32

const list = (v: string | undefined, fallback: string[]) => {
  const parsed = (v ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  return parsed.length ? parsed : fallback
}
const num = (v: string | undefined, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export const DEFAULT_MODELS: Record<Provider, string[]> = {
  groq: ['openai/gpt-oss-120b'],
  openrouter: ['nvidia/nemotron-3-super-120b-a12b:free'],
}

/** Read server settings from environment variables. API keys never reach the browser bundle. */
export function loadConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  return {
    port: num(env.PORT, 8787),
    keys: { groq: env.GROQ_API_KEY?.trim() ?? '', openrouter: env.OPENROUTER_API_KEY?.trim() ?? '' },
    allowedModels: {
      groq: list(env.GROQ_ALLOWED_MODELS, DEFAULT_MODELS.groq),
      openrouter: list(env.OPENROUTER_ALLOWED_MODELS, DEFAULT_MODELS.openrouter),
    },
    perMinute: num(env.RATE_LIMIT_PER_MINUTE, 20),
    perDay: num(env.RATE_LIMIT_PER_DAY, 300),
    trustProxy: env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true',
    staticDir: env.STATIC_DIR ?? 'dist',
    maxBodyBytes: num(env.MAX_BODY_BYTES, 200_000),
    maxMessages: num(env.MAX_MESSAGES, 40),
    maxChars: num(env.MAX_PROMPT_CHARS, 80_000),
    maxTokens: num(env.MAX_OUTPUT_TOKENS, 4096),
    googleClientId: env.GOOGLE_CLIENT_ID?.trim() ?? '',
    sessionSecret: env.SESSION_SECRET?.trim() ?? '',
    sessionDays: num(env.SESSION_DAYS, 7),
    userPerMinute: num(env.USER_RATE_LIMIT_PER_MINUTE, 30),
    userPerDay: num(env.USER_RATE_LIMIT_PER_DAY, 500),
    databaseUrl: env.DATABASE_URL?.trim() ?? '',
    dataDir: env.DATA_DIR ?? 'data',
    maxSyncBytes: num(env.MAX_SYNC_BYTES, 5_000_000),
  }
}
