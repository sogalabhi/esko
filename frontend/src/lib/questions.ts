import type { Question } from '../types/project'

/** Open and answered cards by unlocks (most first); skipped cards drop to the end. */
export function rankQuestions(qs: Question[]): Question[] {
  return [...qs].sort((a, b) => Number(a.status === 'skipped') - Number(b.status === 'skipped') || b.unlocks - a.unlocks)
}
