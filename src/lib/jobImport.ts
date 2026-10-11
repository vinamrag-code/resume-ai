import { getIdToken } from '@/lib/auth/store'
import type { WorkType } from '@/types/resume'

export interface ImportedJob {
  title: string
  company: string
  location: string
  workType: WorkType
  description: string
}

/** True when the text looks like a link we can try to open. */
export function looksLikeUrl(text: string): boolean {
  try {
    const u = new URL(text.trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/** Ask our server to open a job posting link and return its text. Throws an Error with a message fit to show the user. */
export async function importJobFromUrl(url: string, signal?: AbortSignal): Promise<ImportedJob> {
  const token = await getIdToken()
  let res: Response
  try {
    res = await fetch('/api/job/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ url: url.trim() }),
      signal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new Error('Could not reach the server. Check your connection and try again.', { cause: e })
  }
  const data = (await res.json().catch(() => null)) as { job?: ImportedJob; error?: { message?: string } } | null
  if (!res.ok || !data?.job) throw new Error(data?.error?.message ?? `Import failed (${res.status}).`)
  return data.job
}
