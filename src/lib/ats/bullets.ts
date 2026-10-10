const ACTION_VERBS = new Set(
  `accelerated achieved acquired adapted administered advised analyzed analysed architected assembled assessed audited authored automated built championed collaborated completed configured consolidated constructed consulted continued contributed converted coordinated created customized debugged decreased delivered deployed designed detected developed devised directed documented doubled drove eliminated enabled engineered enhanced established estimated evaluated executed expanded facilitated finalized fixed formulated founded generated guided identified implemented improved increased initiated innovated installed integrated introduced investigated launched led leveraged maintained managed mentored migrated modeled modernized monitored negotiated optimized orchestrated organized overhauled owned partnered performed pioneered planned presented prioritized processed produced programmed proposed prototyped provisioned published reduced refactored released remodeled replaced reported researched resolved restructured revamped reviewed rewrote scaled scheduled secured shipped simplified solved spearheaded standardized streamlined strengthened supervised supported synthesized tested trained transformed translated tuned unified upgraded validated visualized wrote`.split(/\s+/),
)

export interface BulletAnalysis {
  text: string
  words: number
  startsWithVerb: boolean
  hasMetric: boolean
  lengthOk: boolean
  /** 0..100 */
  score: number
  issues: string[]
}

export const MIN_WORDS = 8
export const MAX_WORDS = 30

export function analyzeBullet(text: string): BulletAnalysis {
  const trimmed = text.trim()
  const words = trimmed.split(/\s+/).filter(Boolean)
  const first = (words[0] ?? '').toLowerCase().replace(/[^a-z]/g, '')
  const startsWithVerb = ACTION_VERBS.has(first)
  const hasMetric = /\d/.test(trimmed) || /\b(million|billion|thousand)\b/i.test(trimmed)
  const lengthOk = words.length >= MIN_WORDS && words.length <= MAX_WORDS
  const issues: string[] = []
  if (!startsWithVerb) issues.push('Start with a strong action verb')
  if (!hasMetric) issues.push('Add a quantified result if you have one')
  if (words.length < MIN_WORDS) issues.push('Too short: say what you did and the outcome')
  if (words.length > MAX_WORDS) issues.push('Too long: aim for one or two lines')
  const score = (startsWithVerb ? 40 : 0) + (hasMetric ? 30 : 0) + (lengthOk ? 30 : words.length >= 5 && words.length <= 40 ? 15 : 0)
  return { text: trimmed, words: words.length, startsWithVerb, hasMetric, lengthOk, score, issues }
}
