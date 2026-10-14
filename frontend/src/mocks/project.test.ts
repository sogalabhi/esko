import raw from './project.json'
import { mockProject as p } from '../state/project'

const oneOf = <T extends string>(v: unknown, xs: readonly T[]) => typeof v === 'string' && (xs as readonly string[]).includes(v)

describe('mocks/project.json (UI.md §9 shape)', () => {
  it('has every top-level key and is marked illustrative', () => {
    for (const k of ['files', 'facts', 'conflicts', 'questions', 'requirements', 'rules', 'pack', 'brief', 'trust']) {
      expect(raw).toHaveProperty(k)
    }
    expect((raw as { _note?: string })._note).toMatch(/illustrative/i)
  })

  it('ids are present and unique per collection', () => {
    for (const list of [p.files, p.facts, p.conflicts, p.questions, p.requirements, p.rules]) {
      const ids = list.map((x) => x.id)
      ids.forEach((id) => expect(typeof id === 'string' && id.length > 0).toBe(true))
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('every reference resolves', () => {
    const files = new Set(p.files.map((f) => f.id))
    const facts = new Set(p.facts.map((f) => f.id))
    const rules = new Set(p.rules.map((r) => r.id))
    const sources = [
      ...p.facts.flatMap((f) => f.sources),
      ...p.conflicts.flatMap((c) => [...c.left.sources, ...c.right.sources]),
    ]
    sources.forEach((s) => {
      expect(files.has(s.fileId)).toBe(true)
      expect(typeof s.quote).toBe('string')
      expect(typeof s.quoteChecked).toBe('boolean')
      expect(s.where.cell ?? s.where.panel).toBeTruthy()
    })
    p.conflicts.forEach((c) => {
      c.factIds.forEach((id) => expect(facts.has(id)).toBe(true))
      if (c.ruleId) expect(rules.has(c.ruleId)).toBe(true)
      c.locations.forEach((l) => expect(files.has(l.fileId)).toBe(true))
    })
    p.questions.forEach((q) => {
      q.factIds.forEach((id) => expect(facts.has(id)).toBe(true))
      q.ruleIds.forEach((id) => expect(rules.has(id)).toBe(true))
    })
    p.requirements.forEach((r) => expect(rules.has(r.ruleId)).toBe(true))
    p.brief.sections.flatMap((s) => s.sentences).forEach((s) => s.factIds.forEach((id) => expect(facts.has(id)).toBe(true)))
  })

  it('enum fields hold allowed values', () => {
    p.files.forEach((f) => expect(oneOf(f.type, ['pdf', 'sheet'])).toBe(true))
    p.facts.forEach((f) => {
      expect(oneOf(f.state, ['confirmed', 'ai_suggested', 'missing', 'pass'])).toBe(true)
      expect(oneOf(f.group, ['identity', 'ingredients', 'allergens', 'nutrition', 'quantity', 'claims', 'company', 'packaging'])).toBe(true)
      if (f.state === 'missing') expect(f.sources).toHaveLength(0)
      else expect(f.sources.length).toBeGreaterThan(0)
    })
    p.conflicts.forEach((c) => {
      expect(oneOf(c.kind, ['value', 'list', 'math', 'rule', 'meaning'])).toBe(true)
      expect(oneOf(c.severity, ['high', 'medium', 'low'])).toBe(true)
      expect(oneOf(c.owner, ['legal', 'rnd', 'brand'])).toBe(true)
      expect(c.locations.length).toBeGreaterThan(0)
    })
    p.rules.forEach((r) => expect(oneOf(r.status, ['in_force', 'upcoming', 'repealed'])).toBe(true))
  })

  it('carries the demo set from UI.md §6.2 and §6.3', () => {
    const ids = p.conflicts.map((c) => c.id)
    for (const id of ['c-honey', 'c-ingredients', 'c-carbs', 'c-sodium', 'c-added-sugar', 'c-vegan', 'c-allergens', 'c-dv-fat', 'c-calories', 'c-serving', 'c-eu-format', 'c-net-qty', 'c-address']) {
      expect(ids).toContain(id)
    }
    expect(p.facts.find((f) => f.field === 'UPC')?.state).toBe('pass')
    expect(p.questions).toHaveLength(6)
  })
})
