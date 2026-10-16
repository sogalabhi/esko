import type { AskResult, Fact } from '../types/project'
import { formatValue } from './labels'

/** Stand-in for POST /api/ask on the bundled mock: answer only from facts whose field name matches a word of the question. */
export function mockAsk(question: string, facts: Fact[]): AskResult {
  const words = question.toLowerCase().match(/[a-z]{4,}/g) ?? []
  const hits = facts.filter((f) => f.value != null && words.some((w) => f.field.toLowerCase().includes(w))).slice(0, 3)
  if (hits.length === 0) {
    return { answer: 'No fact answers this, so I will not guess. Add a file or answer a question first.', factIds: [], refused: true }
  }
  return { answer: hits.map((f) => `${f.field}: ${formatValue(f)}`).join('. ') + '.', factIds: hits.map((f) => f.id) }
}
