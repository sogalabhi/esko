import { describe, expect, it } from 'vitest'
import { mockProject } from '../state/project'
import { diffIngredients, splitIngredients } from './ingredients'
import { buildTrackChanges, countTokens, trackLists } from './trackChanges'

const fact = (id: string) => mockProject.facts.find((f) => f.id === id)!

describe('trackLists', () => {
  it('agrees with the Phase 2 ingredient diff on the sample', () => {
    const f = fact('f-ingredients')
    const carton = f.sources.find((s) => s.fileId === 'f-carton')!.quote
    const sheet = f.sources.find((s) => s.fileId === 'f-sheet')!.quote
    const diff = diffIngredients(carton, sheet)
    const tokens = trackLists(splitIngredients(carton), splitIngredients(sheet))
    const texts = (k: string) => tokens.filter((t) => t.kind === k).map((t) => t.text)
    expect(texts('del')).toEqual(diff.left.filter((i) => i.status === 'added').map((i) => i.text))
    expect(texts('ins')).toEqual(diff.right.filter((i) => i.status === 'missing').map((i) => i.text))
    expect(texts('dup')).toEqual([...diff.left, ...diff.right].filter((i) => i.status === 'duplicate').map((i) => i.text))
    expect(texts('dup')).toContain('Sunflower Seeds')
    expect(texts('del')).toEqual(expect.arrayContaining(['Walnuts', 'Flax Seeds', 'Dried Strawberries', 'Pumpkin Seeds']))
  })

  it('shows a reworded item as struck old text plus underlined new text', () => {
    const tokens = trackLists(['Oats', 'Honey (1%)'], ['Oats', 'Honey (9%)'])
    expect(tokens).toEqual([
      { kind: 'same', text: 'Oats' },
      { kind: 'change', text: 'Honey (9%)', was: 'Honey (1%)' },
    ])
  })

  it('keeps every item exactly once when nothing changed', () => {
    const t = trackLists(['A', 'B', 'C'], ['a', 'b', 'c'])
    expect(t.map((x) => x.kind)).toEqual(['same', 'same', 'same'])
    expect(countTokens(t)).toEqual({ ins: 0, del: 0, dup: 0, change: 0 })
  })
})

describe('buildTrackChanges', () => {
  it('compares ingredients, allergens and claims from the carton to the sheet', () => {
    const sections = buildTrackChanges(mockProject, 'f-carton')
    expect(sections.map((s) => s.group)).toEqual(['ingredients', 'allergens', 'claims'])
    expect(sections[0].rows.map((r) => r.id)).toEqual(['f-ingredients'])
    const claims = sections[2].rows[0].tokens
    expect(claims.find((t) => t.kind === 'del')?.text).toMatch(/Suitable for Vegans/)
    expect(claims.find((t) => t.kind === 'ins')?.text).toMatch(/tail fins/)
  })
})
