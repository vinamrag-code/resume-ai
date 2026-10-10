export interface DiffSegment {
  type: 'same' | 'add' | 'del'
  text: string
}

function tokenize(s: string): string[] {
  return s.match(/\s+|[^\s]+/g) ?? []
}

/** Word-level diff using a longest-common-subsequence table. Whitespace tokens are preserved. */
export function diffWords(before: string, after: string): DiffSegment[] {
  const a = tokenize(before)
  const b = tokenize(after)
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
    }
  }
  const out: DiffSegment[] = []
  const push = (type: DiffSegment['type'], text: string) => {
    const last = out[out.length - 1]
    if (last && last.type === type) last.text += text
    else out.push({ type, text })
  }
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push('same', a[i]!)
      i++
      j++
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      push('del', a[i]!)
      i++
    } else {
      push('add', b[j]!)
      j++
    }
  }
  while (i < a.length) push('del', a[i++]!)
  while (j < b.length) push('add', b[j++]!)
  return out
}
