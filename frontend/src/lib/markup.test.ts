import { describe, expect, it } from 'vitest'
import { mockProject } from '../state/project'
import type { Project } from '../types/project'
import { buildMarks, isOpenFinding, layoutNotes, packFileId, shortCorrection, spotLabel, wobblyEllipse, wobblyLine, wrapText } from './markup'

const project = (): Project => structuredClone(mockProject)

describe('buildMarks', () => {
  it('draws on the carton PDF', () => {
    expect(packFileId(project())).toBe('f-carton')
  })

  it('makes one mark per open finding with a spot on the carton, at each of its locations', () => {
    const p = project()
    const { marks, offPack } = buildMarks(p, 'f-carton', true)
    const open = p.conflicts.filter((c) => !c.resolution)
    expect(marks.map((m) => m.conflict.id)).toEqual(open.filter((c) => c.locations.some((l) => l.fileId === 'f-carton')).map((c) => c.id))
    expect(offPack).toHaveLength(0)
    for (const m of marks) {
      const locs = m.conflict.locations.filter((l) => l.fileId === 'f-carton')
      expect(m.spots.map((s) => [s.x, s.y, s.w, s.h])).toEqual(locs.map((l) => [l.x, l.y, l.w, l.h]))
      expect(m.owner).toMatch(/^(legal|rnd|brand)$/)
    }
  })

  it('leaves resolved findings out and keeps the numbers of the others', () => {
    const p = project()
    const before = buildMarks(p, 'f-carton', true).marks
    p.conflicts[0].resolution = { choice: 'left', by: 'A', at: '2026-10-16T10:00:00Z' }
    const after = buildMarks(p, 'f-carton', true)
    expect(after.marks.find((m) => m.conflict.id === p.conflicts[0].id)).toBeUndefined()
    expect(after.marks).toHaveLength(before.length - 1)
    expect(after.resolved).toBe(1)
    for (const m of after.marks) expect(m.n).toBe(before.find((b) => b.conflict.id === m.conflict.id)!.n)
  })

  it('in mock mode an answered question settles the finding whose facts it covers; with the backend only a resolution does', () => {
    const p = project()
    const q = p.questions.find((x) => x.id === 'q-honey')!
    q.status = 'answered'
    const honey = p.conflicts.find((c) => c.id === 'c-honey')!
    expect(isOpenFinding(honey, p.questions, true)).toBe(false)
    expect(isOpenFinding(honey, p.questions, false)).toBe(true)
  })

  it('strikes a claim under a rule, writes the computed value above a wrong one, and quotes the other file for a value conflict', () => {
    const { marks } = buildMarks(project(), 'f-carton', true)
    const by = (id: string) => marks.find((m) => m.conflict.id === id)!
    expect(by('c-added-sugar').spots[0].style).toBe('strike')
    expect(by('c-dv-fat').spots[0].style).toBe('correct')
    expect(by('c-dv-fat').correction).toBe('≈19%')
    expect(by('c-honey').note).toBe('sheet says 9%')
    expect(by('c-honey').spots[0].style).toBe('circle')
  })

  it('one ring per place: other findings’ extra spots there only get their number', () => {
    const { marks } = buildMarks(project(), 'f-carton', true)
    const at = (x: number, y: number) => marks.flatMap((m) => m.spots.map((s) => ({ m, s }))).filter(({ s }) => s.x === x && s.y === y)
    const block = at(46, 208) // the ingredient list
    expect(block.filter(({ s }) => !s.quiet).map(({ m }) => m.conflict.id)).toEqual(['c-ingredients'])
    expect(block.filter(({ s }) => s.quiet).map(({ m }) => m.conflict.id).sort()).toEqual(['c-added-sugar', 'c-allergens'])
    expect(new Set(block.map(({ s }) => s.tag)).size).toBe(block.length)
    // Two findings whose own spot is the same place both get a ring, one further out.
    const p = project()
    p.conflicts.find((c) => c.id === 'c-sodium')!.locations = [{ ...p.conflicts.find((c) => c.id === 'c-carbs')!.locations[0] }]
    const twin = buildMarks(p, 'f-carton', true).marks.filter((m) => ['c-carbs', 'c-sodium'].includes(m.conflict.id)).map((m) => m.spots[0])
    expect(twin.map((s) => [s.quiet, s.ring])).toEqual([
      [false, 0],
      [false, 1],
    ])
  })

  it('gives each spot of a multi-spot finding its own name', () => {
    const m = buildMarks(project(), 'f-carton', true).marks.find((x) => x.spots.length === 3)!
    expect(spotLabel(m, m.spots[0])).toBe(m.conflict.explanation + ' (spot 1 of 3)')
  })

  it('opens the source at the spot: the carton quote for the honey mark', () => {
    const m = buildMarks(project(), 'f-carton', true).marks.find((x) => x.conflict.id === 'c-honey')!
    expect(m.spots[0].source?.fileId).toBe('f-carton')
    expect(m.spots[0].source?.quote).toBe('Honey (1%)')
  })

  it('ticks passes that have a spot on the carton', () => {
    const { passes } = buildMarks(project(), 'f-carton', true)
    expect(passes.map((t) => t.fact.id)).toEqual(['f-upc'])
  })
})

describe('hand-drawn geometry', () => {
  it('is deterministic per seed and different across seeds', () => {
    expect(wobblyEllipse(10, 10, 5, 3, 42)).toBe(wobblyEllipse(10, 10, 5, 3, 42))
    expect(wobblyEllipse(10, 10, 5, 3, 42)).not.toBe(wobblyEllipse(10, 10, 5, 3, 43))
    expect(wobblyLine(0, 0, 20, 0, 7)).toMatch(/^M/)
  })
})

describe('notes', () => {
  it('wraps text and ends with an ellipsis when it does not fit', () => {
    expect(wrapText('one two three four', 9, 3)).toEqual(['one two', 'three', 'four'])
    const cut = wrapText('a b c d e f g h i j k l m n o p', 3, 2)
    expect(cut).toHaveLength(2)
    expect(cut[1].endsWith('…')).toBe(true)
  })

  it('places notes beside the page without overlaps', () => {
    const p = project()
    const { marks } = buildMarks(p, 'f-carton', true)
    const page = { w: 456, h: 381 }
    const boxes = layoutNotes(marks, page, { width: 78, lineHeight: 7.4, maxChars: 24, header: 0 })
    expect(boxes).toHaveLength(marks.length)
    for (const side of ['left', 'right'] as const) {
      const col = boxes.filter((b) => b.side === side).sort((a, b) => a.y - b.y)
      col.forEach((b, i) => {
        expect(b.y).toBeGreaterThanOrEqual(0)
        expect(b.y + b.h).toBeLessThanOrEqual(page.h)
        if (i > 0) expect(b.y).toBeGreaterThanOrEqual(col[i - 1].y + col[i - 1].h)
        expect(side === 'left' ? b.x + b.w <= 0 : b.x >= page.w).toBe(true)
      })
    }
  })

  it('shortens a computed value to what a reviewer would write', () => {
    expect(shortCorrection('correct ≈19% (15 g ÷ 78 g DV)')).toBe('≈19%')
    expect(shortCorrection('about 535')).toBe('about 535')
  })
})
