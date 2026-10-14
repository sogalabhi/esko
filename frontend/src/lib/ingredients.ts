export type DiffStatus = 'same' | 'added' | 'missing' | 'duplicate'

export interface DiffItem {
  text: string
  status: DiffStatus
}

/** Split an ingredient statement on top-level commas and full stops (not inside parentheses). */
export function splitIngredients(statement: string): string[] {
  const body = statement.replace(/^\s*ingredients\s*:\s*/i, '')
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of body) {
    if (ch === '(') depth++
    if (ch === ')') depth = Math.max(0, depth - 1)
    if ((ch === ',' || ch === '.') && depth === 0) {
      if (cur.trim()) out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

/** Comparison key: no parentheticals, no "dried", simple plural folding. */
export function ingredientKey(item: string): string {
  return item
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\bdried\b/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/ies$/, 'y').replace(/s$/, ''))
    .join(' ')
}

/**
 * Diff a pack list (left) against a reference list (right).
 * Left items not in right are "added"; right items not in left are "missing";
 * repeats within a list are "duplicate".
 */
export function diffIngredients(left: string, right: string): { left: DiffItem[]; right: DiffItem[] } {
  const l = splitIngredients(left)
  const r = splitIngredients(right)
  const lKeys = new Set(l.map(ingredientKey))
  const rKeys = new Set(r.map(ingredientKey))
  const mark = (items: string[], other: Set<string>, absent: DiffStatus): DiffItem[] => {
    const seen = new Set<string>()
    return items.map((text) => {
      const k = ingredientKey(text)
      const dup = seen.has(k)
      seen.add(k)
      return { text, status: dup ? 'duplicate' : other.has(k) ? 'same' : absent }
    })
  }
  return { left: mark(l, rKeys, 'added'), right: mark(r, lKeys, 'missing') }
}
