import type { Fact } from '../types/project'

/**
 * Stand-in for the backend audit when the app runs on the bundled mock: every number typed into a
 * sentence must appear in some fact. The real audit (units, claim words) runs on the backend (PATCH /api/brief/sentences).
 */
export function auditSentence(text: string, facts: Fact[]): string[] {
  const known = new Set(facts.flatMap((f) => `${f.field} ${f.value ?? ''} ${f.unit ?? ''}`.match(/\d+(?:[.,]\d+)?/g) ?? []))
  const typed = text.match(/\d+(?:[.,]\d+)?/g) ?? []
  return [...new Set(typed)].filter((n) => !known.has(n)).map((n) => `${n} is not in the facts`)
}
