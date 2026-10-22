import { BANK_KIND_LABELS } from '@/types/bank'
import type { BankItem } from '@/types/bank'

/** The whole experience bank as plain text, for prompts that write about the user without a resume. */
export function bankToText(items: BankItem[]): string {
  return items
    .map((i) => {
      const dates = [i.start, i.end].filter(Boolean).join(' - ')
      const head = `${BANK_KIND_LABELS[i.kind]}: ${[i.title, i.org, dates].filter(Boolean).join(', ')}`
      const skills = i.skills.length ? [`Skills: ${i.skills.join(', ')}`] : []
      return [head, ...i.bullets.map((b) => `- ${b}`), ...skills].join('\n')
    })
    .join('\n\n')
}
