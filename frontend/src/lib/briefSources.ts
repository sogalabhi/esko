import type { BriefSection, Fact, ProjectFile, Source } from '../types/project'
import { formatValue, sourceShort } from './labels'

/** One numbered entry in the printed "Sources" appendix. Holds no internal ids. */
export interface SourceEntry {
  n: number
  /** "Carton · Back", "Sheet · B26" (the SourceChip label), or "Answered by a person". */
  location: string
  /** The file's name, when there is a file. */
  fileName?: string
  /** The quoted text, when there is a file. */
  quote?: string
  quoteChecked?: boolean
  /** The facts this source backs, by name ("Net quantity"). */
  supports: string[]
}

export interface SourceRefs {
  entries: SourceEntry[]
  /** Reference numbers per sentence, keyed "sectionIndex:sentenceIndex". */
  bySentence: Map<string, number[]>
}

export const sentenceKey = (sectionIndex: number, sentenceIndex: number) => `${sectionIndex}:${sentenceIndex}`

function sourceKey(s: Source): string {
  const w = s.where
  return JSON.stringify([s.fileId, w.panel ?? null, w.page ?? null, w.sheet ?? null, w.cell ?? null, w.line ?? null, w.paragraph ?? null, s.quote])
}

/**
 * Number every cited source in order of first use. The same source (file, spot and quote) cited by
 * several sentences or facts keeps one number. A fact with no source file (a person's answer) gets
 * its own entry so every citation still maps to a number.
 */
export function buildSourceRefs(sections: BriefSection[], facts: Fact[], files: ProjectFile[]): SourceRefs {
  const byKey = new Map<string, SourceEntry>()
  const entries: SourceEntry[] = []
  const bySentence = new Map<string, number[]>()

  const entry = (key: string, make: () => Omit<SourceEntry, 'n' | 'supports'>, field: string): number => {
    let e = byKey.get(key)
    if (!e) {
      e = { ...make(), n: entries.length + 1, supports: [] }
      byKey.set(key, e)
      entries.push(e)
    }
    if (field && !e.supports.includes(field)) e.supports.push(field)
    return e.n
  }

  sections.forEach((sec, si) =>
    sec.sentences.forEach((sentence, i) => {
      const nums: number[] = []
      for (const id of sentence.factIds) {
        const fact = facts.find((f) => f.id === id)
        if (!fact) {
          nums.push(entry(`missing:${id}`, () => ({ location: 'Source not found' }), ''))
          continue
        }
        if (fact.sources.length === 0) {
          const value = formatValue(fact)
          nums.push(
            entry(`fact:${id}`, () => ({ location: fact.state === 'missing' ? 'No source yet' : 'Answered by a person', quote: value || undefined, quoteChecked: true }), fact.field),
          )
          continue
        }
        for (const src of fact.sources) {
          const file = files.find((f) => f.id === src.fileId)
          nums.push(
            entry(sourceKey(src), () => ({ location: sourceShort(src, file), fileName: file?.name, quote: src.quote, quoteChecked: src.quoteChecked }), fact.field),
          )
        }
      }
      bySentence.set(sentenceKey(si, i), [...new Set(nums)].sort((a, b) => a - b))
    }),
  )
  return { entries, bySentence }
}
