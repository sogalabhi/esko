import { describe, expect, it } from 'vitest'
import type { BriefSection, Fact, ProjectFile, Source } from '../types/project'
import { buildSourceRefs, sentenceKey } from './briefSources'

const files: ProjectFile[] = [
  { id: 'file-pdf', name: 'carton.pdf', type: 'pdf', pages: 1, status: 'done', skipped: [] },
  { id: 'file-xls', name: 'sheet.xlsx', type: 'sheet', pages: 1, status: 'done', skipped: [] },
] as ProjectFile[]

const src = (fileId: string, where: Source['where'], quote: string): Source => ({ fileId, where, quote, quoteChecked: true })
const fact = (id: string, field: string, sources: Source[], extra: Partial<Fact> = {}): Fact =>
  ({ id, group: 'identity', field, value: 'v', unit: null, state: 'confirmed', sources, ...extra }) as Fact

const back = src('file-pdf', { panel: 'Back' }, 'Made in USA')
const facts: Fact[] = [
  fact('fact-a', 'Brand', [src('file-xls', { cell: 'B13' }, 'Dancing Fish')]),
  fact('fact-b', 'Origin', [back]),
  // A second fact quoting the very same spot.
  fact('fact-c', 'Country', [{ ...back }]),
  fact('fact-d', 'Net quantity', [src('file-xls', { cell: 'B20' }, '480 g'), src('file-pdf', { panel: 'Front' }, '480g')]),
  fact('fact-e', 'Launch market', [], { value: 'US', state: 'confirmed' }),
]
const sections: BriefSection[] = [
  { title: 'One', sentences: [{ text: 'a', factIds: ['fact-a', 'fact-b'], status: 'ok', problems: [], source: 'ai' }] },
  {
    title: 'Two',
    sentences: [
      { text: 'b', factIds: ['fact-c', 'fact-a'], status: 'ok', problems: [], source: 'ai' },
      { text: 'c', factIds: ['fact-d', 'fact-e'], status: 'ok', problems: [], source: 'code' },
      { text: 'd', factIds: [], status: 'ok', problems: [], source: 'code' },
      { text: 'e', factIds: ['fact-zzz'], status: 'unproven', problems: [], source: 'user' },
    ],
  },
] as BriefSection[]

describe('buildSourceRefs', () => {
  const { entries, bySentence } = buildSourceRefs(sections, facts, files)

  it('numbers sources in order of first use and reuses a number for the same source', () => {
    expect(bySentence.get(sentenceKey(0, 0))).toEqual([1, 2])
    // fact-c quotes the same spot as fact-b; fact-a again: no new numbers.
    expect(bySentence.get(sentenceKey(1, 0))).toEqual([1, 2])
    expect(entries[1]).toMatchObject({ n: 2, location: 'Carton · Back', fileName: 'carton.pdf', quote: 'Made in USA', supports: ['Origin', 'Country'] })
  })

  it('gives every source of a multi-source fact its own number, and a person answer its own entry', () => {
    expect(bySentence.get(sentenceKey(1, 1))).toEqual([3, 4, 5])
    expect(entries[2]).toMatchObject({ location: 'Sheet · B20', quote: '480 g' })
    expect(entries[3]).toMatchObject({ location: 'Carton · Front', quote: '480g' })
    expect(entries[4]).toMatchObject({ location: 'Answered by a person', quote: 'US', supports: ['Launch market'] })
  })

  it('a sentence with no facts has no numbers; an unknown fact still maps to a number without its id', () => {
    expect(bySentence.get(sentenceKey(1, 2))).toEqual([])
    expect(bySentence.get(sentenceKey(1, 3))).toEqual([6])
    expect(entries[5].location).toBe('Source not found')
  })

  it('every number used is in the entries, numbered 1..n, and no entry holds an internal id', () => {
    expect(entries.map((e) => e.n)).toEqual([1, 2, 3, 4, 5, 6])
    for (const nums of bySentence.values()) for (const n of nums) expect(entries.some((e) => e.n === n)).toBe(true)
    const text = JSON.stringify(entries)
    for (const id of ['fact-', 'file-pdf', 'file-xls']) expect(text).not.toContain(id)
  })
})
