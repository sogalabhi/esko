import { diffLists, ingredientKey, splitIngredients } from './ingredients'
import type { Fact, FactGroup, Project, Source } from '../types/project'

/**
 * Word-style track changes from the pack (old) to a reference file (new):
 * ins = only in the reference (underlined), del = only on the pack (struck),
 * dup = listed twice (highlighted), change = same item, different wording.
 * Statuses come from the Phase 2 ingredient diff (`diffLists`), so the two always agree.
 */
export type TrackKind = 'same' | 'ins' | 'del' | 'dup' | 'change'

export interface TrackToken {
  kind: TrackKind
  text: string
  /** The pack's wording when kind is 'change'. */
  was?: string
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()

export function trackLists(oldItems: string[], newItems: string[]): TrackToken[] {
  const { left: a, right: b } = diffLists(oldItems, newItems)
  const ka = a.map((i) => (i.status === 'duplicate' ? null : ingredientKey(i.text)))
  const kb = b.map((i) => (i.status === 'duplicate' ? null : ingredientKey(i.text)))
  const n = a.length
  const m = b.length
  // lcs[i][j] = longest common run of keys in a[i:], b[j:]
  const lcs = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i][j] = ka[i] !== null && ka[i] === kb[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])

  const out: TrackToken[] = []
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && ka[i] !== null && ka[i] === kb[j] && lcs[i][j] === lcs[i + 1][j + 1] + 1) {
      const same = norm(a[i].text) === norm(b[j].text)
      out.push(same ? { kind: 'same', text: b[j].text } : { kind: 'change', text: b[j].text, was: a[i].text })
      i++
      j++
    } else if (i < n && (j >= m || lcs[i + 1][j] >= lcs[i][j + 1])) {
      const s = a[i].status
      // A reordered item ('same' outside the common run) is shown once, at its reference position.
      if (s === 'added') out.push({ kind: 'del', text: a[i].text })
      else if (s === 'duplicate') out.push({ kind: 'dup', text: a[i].text })
      i++
    } else {
      const s = b[j].status
      out.push({ kind: s === 'missing' ? 'ins' : s === 'duplicate' ? 'dup' : 'same', text: b[j].text })
      j++
    }
  }
  return out
}

export function countTokens(tokens: TrackToken[]): Record<Exclude<TrackKind, 'same'>, number> {
  const c = { ins: 0, del: 0, dup: 0, change: 0 }
  for (const t of tokens) if (t.kind !== 'same') c[t.kind]++
  return c
}

export interface TrackRow {
  id: string
  label: string
  tokens: TrackToken[]
  oldSources: Source[]
  newSources: Source[]
}

export interface TrackSection {
  group: FactGroup
  rows: TrackRow[]
}

const LIST_GROUPS: FactGroup[] = ['ingredients', 'allergens']

/** The reference file for a fact: the first source that is not on the pack file. */
const otherSource = (f: Fact, packId: string) => f.sources.find((s) => s.fileId !== packId)
const packSource = (f: Fact, packId: string) => f.sources.find((s) => s.fileId === packId)

/**
 * Ingredient and allergen lists, and the set of claims, as track changes from the pack file to the other file.
 * Facts only on one file still count for claims (they are the insertions and deletions).
 */
export function buildTrackChanges(project: Project, packId: string): TrackSection[] {
  const sections: TrackSection[] = []
  for (const group of LIST_GROUPS) {
    const rows: TrackRow[] = []
    for (const f of project.facts.filter((x) => x.group === group)) {
      const o = packSource(f, packId)
      const r = otherSource(f, packId)
      if (!o || !r) continue
      const oldItems = splitIngredients(o.quote)
      const newItems = splitIngredients(r.quote)
      if (Math.max(oldItems.length, newItems.length) < 2) continue
      rows.push({ id: f.id, label: f.field, tokens: trackLists(oldItems, newItems), oldSources: [o], newSources: [r] })
    }
    if (rows.length) sections.push({ group, rows })
  }

  const claims = project.facts.filter((f) => f.group === 'claims' && f.sources.length)
  // The reference file most claims come from.
  const tally = new Map<string, number>()
  for (const f of claims) for (const s of f.sources) if (s.fileId !== packId) tally.set(s.fileId, (tally.get(s.fileId) ?? 0) + 1)
  const refId = [...tally.entries()].sort((x, y) => y[1] - x[1])[0]?.[0]
  if (refId) {
    const old = claims.flatMap((f) => f.sources.filter((s) => s.fileId === packId).slice(0, 1))
    const ref = claims.flatMap((f) => f.sources.filter((s) => s.fileId === refId).slice(0, 1))
    if (old.length || ref.length) {
      sections.push({
        group: 'claims',
        rows: [{ id: 'claims', label: 'Claims and marks', tokens: trackLists(old.map((s) => s.quote), ref.map((s) => s.quote)), oldSources: old, newSources: ref }],
      })
    }
  }
  return sections
}
