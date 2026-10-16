import { describe, expect, it } from 'vitest'
import type { FileType, ProjectFile, Source } from '../types/project'
import { fileUnits, sourceLong, sourceShort } from './labels'

const file = (type: FileType, pages = 3): ProjectFile => ({ id: `f-${type}`, name: `x.${type}`, type, pages, status: 'done', skipped: [] })
const src = (where: Source['where']): Source => ({ fileId: 'f', where, quote: 'q', quoteChecked: true })

describe('source chip labels by file type', () => {
  it.each([
    ['pdf', { panel: 'Back', page: 1 }, 'Carton · Back', 'Carton · Back panel'],
    ['document', { page: 2 }, 'Spec · p.2', 'Document · page 2'],
    ['sheet', { sheet: 'Sheet1', cell: 'B26' }, 'Sheet · B26', 'Content sheet · B26'],
    ['docx', { paragraph: 7 }, 'Word · ¶7', 'Word document · paragraph 7'],
    ['text', { line: 4 }, 'Notes · line 4', 'Notes · line 4'],
    ['image', { page: 1, bbox: [1, 2, 3, 4] }, 'Image', 'Image'],
  ] as [FileType, Source['where'], string, string][])('%s', (type, where, short, long) => {
    expect(sourceShort(src(where), file(type))).toBe(short)
    expect(sourceLong(src(where), file(type))).toBe(long)
  })

  it('falls back to a plain word when the file is unknown', () => {
    expect(sourceShort(src({}), undefined)).toBe('File')
  })
})

describe('unit counts', () => {
  it.each([
    ['pdf', 1, '1 page'],
    ['document', 4, '4 pages'],
    ['sheet', 2, '2 sheets'],
    ['docx', 7, '7 paragraphs'],
    ['text', 1, '1 line'],
    ['text', 12, '12 lines'],
    ['image', 1, '1 image'],
  ] as [FileType, number, string][])('%s x %i', (type, n, text) => {
    expect(fileUnits(file(type, n))).toBe(text)
  })
})
