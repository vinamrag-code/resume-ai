export type Provider = 'groq' | 'openrouter' | 'inception'

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
  /**
   * Firebase web app settings. These are public by design (they ship in every Firebase web app); access is
   * controlled by sign-in and Firestore security rules. When complete, AI features and cloud sync require sign-in.
   */
  firebase: { apiKey: string; authDomain: string; projectId: string; appId: string }
  /** Per signed-in user limits (replace the per-IP limits for signed-in requests). */
  userPerMinute: number
  userPerDay: number
}

/** Sign-in is on only when the Firebase web config is complete. */
export const authEnabled = (cfg: Pick<ServerConfig, 'firebase'>): boolean => Object.values(cfg.firebase).every(Boolean)

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
  inception: ['mercury-2.5', 'mercury-3'],
}

/** Read server settings from environment variables. API keys never reach the browser bundle. */
export function loadConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  return {
    port: num(env.PORT, 8787),
    keys: { groq: env.GROQ_API_KEY?.trim() ?? '', openrouter: env.OPENROUTER_API_KEY?.trim() ?? '', inception: env.INCEPTION_API_KEY?.trim() ?? '' },
    allowedModels: {
      groq: list(env.GROQ_ALLOWED_MODELS, DEFAULT_MODELS.groq),
      openrouter: list(env.OPENROUTER_ALLOWED_MODELS, DEFAULT_MODELS.openrouter),
      inception: list(env.INCEPTION_ALLOWED_MODELS, DEFAULT_MODELS.inception),
    },
    perMinute: num(env.RATE_LIMIT_PER_MINUTE, 20),
    perDay: num(env.RATE_LIMIT_PER_DAY, 300),
    trustProxy: env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true',
    staticDir: env.STATIC_DIR ?? 'dist',
    maxBodyBytes: num(env.MAX_BODY_BYTES, 200_000),
    maxMessages: num(env.MAX_MESSAGES, 40),
    maxChars: num(env.MAX_PROMPT_CHARS, 80_000),
    maxTokens: num(env.MAX_OUTPUT_TOKENS, 4096),
    firebase: {
      apiKey: env.FIREBASE_API_KEY?.trim() ?? '',
      authDomain: env.FIREBASE_AUTH_DOMAIN?.trim() ?? '',
      projectId: env.FIREBASE_PROJECT_ID?.trim() ?? '',
      appId: env.FIREBASE_APP_ID?.trim() ?? '',
    },
    userPerMinute: num(env.USER_RATE_LIMIT_PER_MINUTE, 30),
    userPerDay: num(env.USER_RATE_LIMIT_PER_DAY, 500),
  }
}
