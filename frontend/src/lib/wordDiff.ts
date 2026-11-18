/** Word-level difference between two texts, for showing what a new version of a file changed. */

export type Op = { kind: 'same' | 'del' | 'ins' | 'gap'; text: string }

const TOKEN = /\d+(?:[.,]\d+)?\s?%?|[A-Za-z]+(?:'[a-z]+)?|\s+|[^\sA-Za-z\d]/g

const tokenize = (s: string): string[] => s.match(TOKEN) ?? []

/** Longest common subsequence of the two token lists, as same / del / ins runs. */
export function diffWords(before: string, after: string): Op[] {
  const a = tokenize(before)
  const b = tokenize(after)
  const w = b.length + 1
  const dp = new Uint16Array((a.length + 1) * w)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i * w + j] = a[i] === b[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1])
    }
  }
  const ops: Op[] = []
  const push = (kind: Op['kind'], text: string) => {
    const last = ops[ops.length - 1]
    if (last && last.kind === kind) last.text += text
    else ops.push({ kind, text })
  }
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push('same', a[i])
      i++
      j++
    } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) push('del', a[i++])
    else push('ins', b[j++])
  }
  while (i < a.length) push('del', a[i++])
  while (j < b.length) push('ins', b[j++])
  return ops
}

/** Keeps `context` words around every change and replaces the unchanged text in between with a gap. */
export function collapse(ops: Op[], context = 4): Op[] {
  const out: Op[] = []
  ops.forEach((op, k) => {
    if (op.kind !== 'same') return void out.push(op)
    const parts = op.text.match(/\S+\s*|\s+/g) ?? []
    const keepHead = k > 0 ? context : 0
    const keepTail = k < ops.length - 1 ? context : 0
    if (parts.length <= keepHead + keepTail + 1) return void out.push(op)
    if (keepHead) out.push({ kind: 'same', text: parts.slice(0, keepHead).join('') })
    out.push({ kind: 'gap', text: '…' })
    if (keepTail) out.push({ kind: 'same', text: parts.slice(parts.length - keepTail).join('') })
  })
  return out
}

const NUMBER = /\d+(?:[.,]\d+)?\s?(?:%|mcg|mg|kcal|kj|kg|ml|oz|g|l)?/gi

export interface NumberDelta {
  before: string
  after: string
  /** The words just before the number ("Honey"), so the change reads on its own. */
  label?: string
}

/** The numbers that differ, in order, when both texts carry the same count of them. */
export function numberDeltas(before: string, after: string): NumberDelta[] {
  const a = [...before.matchAll(NUMBER)]
  const b = [...after.matchAll(NUMBER)]
  if (a.length !== b.length) return []
  const out: NumberDelta[] = []
  a.forEach((m, k) => {
    const n = b[k]
    if (m[0].trim() === n[0].trim()) return
    const lead = after.slice(0, n.index).match(/([A-Za-z][A-Za-z ]{1,24}?)[\s(:]*$/)
    out.push({ before: m[0].trim(), after: n[0].trim(), label: lead?.[1].trim() })
  })
  return out
}
