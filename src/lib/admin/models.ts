import { useAuth } from '@/lib/auth/store'
import type { CloudProvider, ServerModels } from '@/lib/llm/providers'

export const MODEL_NAME = /^[\w./:@+-]{1,120}$/

async function db() {
  const [{ getFirebase }, fs] = await Promise.all([import('@/lib/firebase/app'), import('firebase/firestore')])
  const cfg = useAuth.getState().firebase
  if (!cfg) throw new Error('Firebase is not configured.')
  return { fs, db: getFirebase(cfg).db }
}

/** Admins are users with a document at admins/{uid}, created once by hand in the Firebase console. */
export async function fetchIsAdmin(uid: string): Promise<boolean> {
  try {
    const { fs, db: d } = await db()
    return (await fs.getDoc(fs.doc(d, 'admins', uid))).exists()
  } catch {
    return false
  }
}

/** Parse a textarea of model names (one per line, or comma separated) into a valid, de-duplicated list. */
export function parseModelList(text: string): { models: string[]; invalid: string[] } {
  const parts = text.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
  const models = [...new Set(parts.filter((p) => MODEL_NAME.test(p)))]
  return { models: models.slice(0, 20), invalid: parts.filter((p) => !MODEL_NAME.test(p)) }
}

/** Save the allowed models and defaults. Only admins can write this document (enforced by the Firestore rules). */
export async function saveModelConfig(cfg: ServerModels): Promise<void> {
  for (const p of ['groq', 'openrouter'] as CloudProvider[]) {
    if (cfg.allowed[p].length === 0) throw new Error(`Add at least one ${p} model.`)
    if (!cfg.allowed[p].includes(cfg.defaults[p])) throw new Error(`The default ${p} model must be one of its allowed models.`)
  }
  const { fs, db: d } = await db()
  await fs.setDoc(fs.doc(d, 'config', 'models'), { groq: cfg.allowed.groq, openrouter: cfg.allowed.openrouter, defaults: cfg.defaults, updatedAt: Date.now() })
}
