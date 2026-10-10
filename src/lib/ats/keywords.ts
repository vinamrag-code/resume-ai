const STOPWORDS = new Set(
  `a about above after again all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its just me more most my no nor not now of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours
 etc via per within across including include includes ensure ensuring using use used able ability strong excellent good great best new well like etc e.g i.e eg ie`.split(/\s+/),
)

/** Words that show up in nearly every job post and say nothing about fit. */
const GENERIC = new Set(
  `experience experiences work working works team teams role roles job position candidate candidates company companies looking seeking join responsibilities responsibility requirements required require qualifications preferred plus years year skills skill knowledge understanding opportunity opportunities benefits salary equal employer employment people business environment support help provide providing develop developing development build building looking deliver delivering drive driving highly must will can may need needs needed related relevant various multiple including etc ideal successful passion passionate fast paced fast-paced day daily time full part remote hybrid onsite location apply application degree bachelor bachelors master masters preferred familiarity proficiency proficient hands-on hands ownership collaborate collaboration collaborating communicate communication cross-functional stakeholders`.split(
    /\s+/,
  ),
)

/** Recognised technology / skill terms get extra weight. Not exhaustive; frequency does the rest. */
const TECH = new Set(
  `javascript typescript python java kotlin swift go golang rust ruby php scala sql nosql html css sass react angular vue svelte next.js nextjs node node.js nodejs express django flask fastapi spring rails laravel graphql rest restful grpc docker kubernetes terraform ansible aws azure gcp linux git ci/cd cicd jenkins github postgresql postgres mysql mongodb redis kafka rabbitmq elasticsearch spark hadoop airflow pandas numpy pytorch tensorflow scikit-learn machine-learning ml ai nlp llm tableau powerbi excel figma agile scrum jira testing jest vitest cypress selenium microservices api apis devops sre android ios flutter c++ c# .net`.split(
    /\s+/,
  ),
)

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z0-9+#./-]*[a-z0-9+#]|[a-z]/g) ?? []).map((t) => t.replace(/^[./-]+|[./-]+$/g, '')).filter(Boolean)
}

/** Very small stemmer: enough to match "managed"/"managing"/"manages" and plural forms. */
export function stem(word: string): string {
  let w = word
  if (w.length > 4 && w.endsWith('ies')) w = `${w.slice(0, -3)}y`
  else if (w.length > 4 && w.endsWith('ing')) w = w.slice(0, -3)
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2)
  else if (w.length > 3 && w.endsWith('es')) w = w.slice(0, -2)
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1)
  return w.replace(/(.)\1$/, '$1')
}

const isUseful = (t: string) => t.length > 1 && !STOPWORDS.has(t) && !GENERIC.has(t) && !/^\d+$/.test(t)

export interface Keyword {
  term: string
  weight: number
}

/** Deterministic keyword extraction from a job description (frequency + tech-term boost + repeated bigrams). */
export function extractKeywords(jobDescription: string, max = 25): Keyword[] {
  const tokens = tokenize(jobDescription)
  const counts = new Map<string, { term: string; n: number }>()
  const bump = (term: string, by = 1) => {
    const key = term.split(' ').map(stem).join(' ')
    const cur = counts.get(key)
    if (cur) cur.n += by
    else counts.set(key, { term, n: by })
  }
  for (const t of tokens) if (isUseful(t)) bump(t)
  const bigrams = new Map<string, number>()
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i]!
    const b = tokens[i + 1]!
    if (isUseful(a) && isUseful(b)) bigrams.set(`${a} ${b}`, (bigrams.get(`${a} ${b}`) ?? 0) + 1)
  }
  const out: Keyword[] = []
  for (const [key, { term, n }] of counts) {
    const weight = n * (TECH.has(term) ? 2.5 : 1) + (n === 1 && !TECH.has(term) ? -0.5 : 0)
    if (weight > 0.5 && (n > 1 || TECH.has(term))) out.push({ term, weight })
    else if (n === 1 && term.length > 3 && /^[a-z]/.test(key)) out.push({ term, weight: 0.5 })
  }
  for (const [term, n] of bigrams) {
    if (n >= 2) out.push({ term, weight: n * 1.5 })
  }
  // Drop unigrams fully covered by a kept bigram of similar weight to avoid double counting.
  const kept = out.sort((a, b) => b.weight - a.weight || a.term.localeCompare(b.term)).slice(0, max * 2)
  const bigramTerms = kept.filter((k) => k.term.includes(' '))
  const final = kept.filter((k) => k.term.includes(' ') || !bigramTerms.some((b) => b.term.split(' ').map(stem).includes(stem(k.term)) && b.weight >= k.weight))
  return final.slice(0, max)
}

export interface KeywordMatch {
  matched: Keyword[]
  missing: Keyword[]
  /** Weighted coverage 0..1. */
  coverage: number
}

export function matchKeywords(keywords: Keyword[], resumeText: string): KeywordMatch {
  const stemmed = ` ${tokenize(resumeText).map(stem).join(' ')} `
  const matched: Keyword[] = []
  const missing: Keyword[] = []
  for (const k of keywords) {
    const needle = ` ${k.term.split(' ').map(stem).join(' ')} `
    ;(stemmed.includes(needle) ? matched : missing).push(k)
  }
  const total = keywords.reduce((s, k) => s + k.weight, 0)
  const got = matched.reduce((s, k) => s + k.weight, 0)
  return { matched, missing, coverage: total === 0 ? 0 : got / total }
}
