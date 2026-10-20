import type { Question } from '../types/project'

/** The questions the checker shows: decisions about the artwork (conflicts, missing items). Design and
 *  brand-basics questions belong to a new design, so they stay hidden. */
export function reviewQuestions(qs: Question[]): Question[] {
  return qs.filter((q) => q.kind !== 'design')
}

/** Open and answered cards by unlocks (most first); skipped cards drop to the end. */
export function rankQuestions(qs: Question[]): Question[] {
  return [...qs].sort((a, b) => Number(a.status === 'skipped') - Number(b.status === 'skipped') || b.unlocks - a.unlocks)
}
