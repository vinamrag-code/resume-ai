import { useAuth } from '@/lib/auth/store'
import type { CloudProvider, ServerModels } from '@/lib/llm/providers'

export const MODEL_NAME = /^[\w./:@+-]{1,120}$/

async function db() {
  const [{ getFirebase }, fs] = await Promise.all([import('@/lib/firebase/app'), import('firebase/firestore')])
  const cfg = useAuth.getState().firebase
  if (!cfg) throw new Error('Firebase is not configured.')
  return { fs, db: getFirebase(cfg).db }
}

export type AdminCheck = { status: 'admin' | 'member' } | { status: 'error'; message: string }

/**
 * Admins are users with a document at admins/{uid}, created once by hand in the Firebase console.
 * Distinguishes "no such document" (a member) from "the check itself failed", so the page can say why.
 */
export async function checkAdmin(uid: string): Promise<AdminCheck> {
  try {
    const { fs, db: d } = await db()
    return { status: (await fs.getDoc(fs.doc(d, 'admins', uid))).exists() ? 'admin' : 'member' }
  } catch (e) {
    const code = (e as { code?: string }).code ?? ''
    if (code === 'permission-denied') {
      return { status: 'error', message: 'Firestore refused the admin check. Your session may not know your email is verified yet (sign out and back in), or the Firestore rules are not published.' }
    }
    if (code === 'unavailable') return { status: 'error', message: 'Could not reach Firestore to check admin status. Check your connection.' }
    return { status: 'error', message: 'Could not check admin status.' }
  }
}

export async function fetchIsAdmin(uid: string): Promise<boolean> {
  return (await checkAdmin(uid)).status === 'admin'
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
