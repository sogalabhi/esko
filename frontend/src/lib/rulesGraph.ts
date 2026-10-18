import { stateLabel, type BadgeState } from '../components/StateBadge'
import type { Fact, Project, Question, Requirement, Rule } from '../types/project'
import { formatValue } from './labels'

/**
 * Rules map data: Product facts → Rules → Required pack items, built only from
 * project.facts, project.rules and project.requirements. Pure, so it is tested without React Flow.
 */

/** A requirement as shown: its backend status, or 'decided' once every question about it is answered. */
export type ReqShown = Requirement['status'] | 'decided'
/** A rule's state rolls up its requirements. */
export type RuleShown = 'met' | 'missing' | 'conflict'

export const REQ_WORD: Record<ReqShown, string> = { met: 'Met', decided: 'Decided', missing: 'Missing', conflict: 'Conflict' }
export const RULE_WORD: Record<RuleShown, string> = { met: 'All met', missing: 'Needs an answer', conflict: 'Conflict' }

interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface FactNode extends Box {
  kind: 'fact'
  id: string
  factId: string
  /** Undefined when a requirement points at a fact the project does not have. */
  fact?: Fact
  field: string
  /** Short display value, or null when the fact is missing. */
  value: string | null
  state: BadgeState
  ruleIds: string[]
  requirementIds: string[]
  label: string
}

export interface RuleNode extends Box {
  kind: 'rule'
  id: string
  ruleId: string
  /** Undefined when a requirement cites a rule that is not in the market pack data. */
  rule?: Rule
  ref: string
  state: RuleShown
  requirementIds: string[]
  factIds: string[]
  counts: Record<ReqShown, number>
  label: string
}

export interface RequirementNode extends Box {
  kind: 'requirement'
  id: string
  requirement: Requirement
  ruleId: string
  factIds: string[]
  state: ReqShown
  /** Questions whose answer settles this requirement. */
  questionIds: string[]
  label: string
}

export type MapNode = FactNode | RuleNode | RequirementNode

export interface MapEdge {
  id: string
  source: string
  target: string
  /** The requirements this edge is part of (for highlighting a path). */
  requirementIds: string[]
}

export interface RulesGraph {
  facts: FactNode[]
  rules: RuleNode[]
  requirements: RequirementNode[]
  edges: MapEdge[]
  /** Rules in the project that no requirement uses: checked, nothing needed. */
  otherRules: number
  /** Column left edges and the size of the whole drawing. */
  columns: { fact: number; rule: number; requirement: number }
  width: number
  height: number
}

export const factNodeId = (id: string) => `fact:${id}`
export const ruleNodeId = (id: string) => `rule:${id}`
export const reqNodeId = (id: string) => `req:${id}`

export const SIZE = {
  fact: { w: 230, h: 54 },
  rule: { w: 200, h: 64 },
  requirement: { w: 230, h: 76 },
  gap: 10,
  column: 72,
  /** Room above the nodes for the column headings. */
  top: 40,
}

const MAX_VALUE = 28

function shortValue(f: Fact): string | null {
  if (f.value == null || f.value === '' || f.state === 'missing') return null
  const v = formatValue(f)
  return v.length > MAX_VALUE ? `${v.slice(0, MAX_VALUE - 1).trimEnd()}…` : v
}

/** The questions whose answer settles a requirement: by requirementIds when the backend sends them, else by the rule they cite. */
export function questionsFor(r: Requirement, questions: Question[]): Question[] {
  return questions.filter((q) => (q.requirementIds ? q.requirementIds.includes(r.id) : q.ruleIds.includes(r.ruleId)))
}

export function requirementState(r: Requirement, questions: Question[]): ReqShown {
  if (r.status === 'met') return 'met'
  const qs = questionsFor(r, questions)
  return qs.length > 0 && qs.every((q) => q.status === 'answered') ? 'decided' : r.status
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/** "2 requirements, 1 conflict, 1 met". */
export function countsText(counts: Record<ReqShown, number>): string {
  const total = counts.met + counts.decided + counts.missing + counts.conflict
  const parts = [plural(total, 'requirement')]
  if (counts.conflict) parts.push(plural(counts.conflict, 'conflict'))
  if (counts.missing) parts.push(`${counts.missing} missing`)
  if (counts.decided) parts.push(`${counts.decided} decided`)
  if (counts.met) parts.push(`${counts.met} met`)
  return parts.join(', ')
}

export function buildRulesGraph(project: Project): RulesGraph {
  const factById = new Map(project.facts.map((f) => [f.id, f]))
  const ruleById = new Map(project.rules.map((r) => [r.id, r]))
  const inConflict = new Set(project.conflicts.filter((c) => !c.resolution).flatMap((c) => c.factIds))

  // Rules in market-pack order, then any rule a requirement cites that the data lacks.
  const usedRuleIds = new Set(project.requirements.map((r) => r.ruleId))
  const ruleOrder = [
    ...project.rules.filter((r) => usedRuleIds.has(r.id)).map((r) => r.id),
    ...[...usedRuleIds].filter((id) => !ruleById.has(id)),
  ]

  // Requirements grouped under their rule, so edges do not cross.
  const reqs = ruleOrder.flatMap((rid) => project.requirements.filter((r) => r.ruleId === rid))

  const requirements: RequirementNode[] = reqs.map((r) => {
    const state = requirementState(r, project.questions)
    return {
      kind: 'requirement',
      id: reqNodeId(r.id),
      requirement: r,
      ruleId: r.ruleId,
      factIds: r.factIds,
      state,
      questionIds: questionsFor(r, project.questions).map((q) => q.id),
      label: `Pack item ${r.item}${r.panel ? `, on ${r.panel}` : ''}: ${REQ_WORD[state]}`,
      ...SIZE.requirement,
      x: 0,
      y: 0,
    }
  })

  const rules: RuleNode[] = ruleOrder.map((rid) => {
    const rule = ruleById.get(rid)
    const mine = requirements.filter((r) => r.ruleId === rid)
    const counts: Record<ReqShown, number> = { met: 0, decided: 0, missing: 0, conflict: 0 }
    for (const r of mine) counts[r.state]++
    const state: RuleShown = counts.conflict ? 'conflict' : counts.missing ? 'missing' : 'met'
    const ref = rule?.ref ?? 'Rule not in the market pack'
    return {
      kind: 'rule',
      id: ruleNodeId(rid),
      ruleId: rid,
      rule,
      ref,
      state,
      requirementIds: mine.map((r) => r.requirement.id),
      factIds: [...new Set(mine.flatMap((r) => r.factIds))],
      counts,
      label: `Rule ${ref}: ${countsText(counts)}`,
      ...SIZE.rule,
      x: 0,
      y: 0,
    }
  })

  // Facts in order of first use, so they sit next to the rules they feed.
  const factOrder = [...new Set(requirements.flatMap((r) => r.factIds))]
  const facts: FactNode[] = factOrder.map((fid) => {
    const fact = factById.get(fid)
    const users = requirements.filter((r) => r.factIds.includes(fid))
    const value = fact ? shortValue(fact) : null
    const state: BadgeState = !fact ? 'missing' : inConflict.has(fid) ? 'conflict' : fact.state
    const field = fact?.field ?? 'A fact no file has'
    return {
      kind: 'fact',
      id: factNodeId(fid),
      factId: fid,
      fact,
      field,
      value,
      state,
      ruleIds: [...new Set(users.map((r) => r.ruleId))],
      requirementIds: users.map((r) => r.requirement.id),
      label: `Fact ${field}: ${value ?? 'not in any file'}, ${stateLabel(state)}`,
      ...SIZE.fact,
      x: 0,
      y: 0,
    }
  })

  const edges: MapEdge[] = []
  const factEdges = new Map<string, MapEdge>()
  for (const r of requirements) {
    edges.push({ id: `${ruleNodeId(r.ruleId)}->${r.id}`, source: ruleNodeId(r.ruleId), target: r.id, requirementIds: [r.requirement.id] })
    for (const fid of r.factIds) {
      const id = `${factNodeId(fid)}->${ruleNodeId(r.ruleId)}`
      const e = factEdges.get(id)
      if (e) e.requirementIds.push(r.requirement.id)
      else factEdges.set(id, { id, source: factNodeId(fid), target: ruleNodeId(r.ruleId), requirementIds: [r.requirement.id] })
    }
  }
  edges.unshift(...factEdges.values())

  const graph: RulesGraph = {
    facts,
    rules,
    requirements,
    edges,
    otherRules: project.rules.filter((r) => !usedRuleIds.has(r.id)).length,
    columns: { fact: 0, rule: 0, requirement: 0 },
    width: 0,
    height: 0,
  }
  layoutRulesGraph(graph)
  return graph
}

const centre = (b: Box) => b.y + b.h / 2

/** Place boxes near their ideal centres, top to bottom, without overlap. */
function stack(boxes: Box[], ideal: number[]) {
  let floor = -Infinity
  boxes.forEach((b, i) => {
    b.y = Math.max(ideal[i] - b.h / 2, floor)
    floor = b.y + b.h + SIZE.gap
  })
}

/**
 * Three columns, left to right. Requirements stack in order; each rule sits beside its requirements;
 * each fact sits beside the rules it feeds. Mutates the node boxes and sets the drawing size.
 */
export function layoutRulesGraph(g: RulesGraph): RulesGraph {
  const xFact = 0
  const xRule = SIZE.fact.w + SIZE.column
  const xReq = xRule + SIZE.rule.w + SIZE.column
  g.columns = { fact: xFact, rule: xRule, requirement: xReq }

  let y = 0
  for (const r of g.requirements) {
    r.x = xReq
    r.y = y
    y += r.h + SIZE.gap
  }
  const reqById = new Map(g.requirements.map((r) => [r.requirement.id, r]))
  const mean = (xs: number[], fallback: number) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : fallback)

  g.rules.forEach((r) => (r.x = xRule))
  stack(
    g.rules,
    g.rules.map((r) => mean(r.requirementIds.map((id) => centre(reqById.get(id)!)), 0)),
  )
  const ruleById = new Map(g.rules.map((r) => [r.ruleId, r]))
  g.facts.forEach((f) => (f.x = xFact))
  stack(
    g.facts,
    g.facts.map((f) => mean(f.ruleIds.map((id) => centre(ruleById.get(id)!)), 0)),
  )

  g.width = xReq + SIZE.requirement.w
  const all: Box[] = [...g.facts, ...g.rules, ...g.requirements]
  if (all.length === 0) {
    g.height = SIZE.top
    return g
  }
  // A column that grew past the requirements (stacking only pushes down) is centred on them instead.
  const span = (col: Box[]) => [Math.min(...col.map((b) => b.y)), Math.max(...col.map((b) => b.y + b.h))]
  const [reqTop, reqBottom] = span(g.requirements)
  for (const col of [g.rules, g.facts]) {
    const [t, b] = span(col)
    if (b - t > reqBottom - reqTop) {
      const shift = (reqTop + reqBottom) / 2 - (t + b) / 2
      col.forEach((box) => (box.y += shift))
    }
  }
  // Start below the column headings.
  const top = Math.min(...all.map((b) => b.y))
  all.forEach((b) => (b.y += SIZE.top - top))
  g.height = Math.max(...all.map((b) => b.y + b.h))
  return g
}

/** Node ids on the path through a selected node: its rule, requirements and facts. */
export function relatedIds(g: RulesGraph, nodeId: string | null): Set<string> {
  const out = new Set<string>()
  if (!nodeId) return out
  out.add(nodeId)
  const reqIds = new Set<string>()
  const fact = g.facts.find((f) => f.id === nodeId)
  const rule = g.rules.find((r) => r.id === nodeId)
  const req = g.requirements.find((r) => r.id === nodeId)
  if (fact) fact.requirementIds.forEach((id) => reqIds.add(id))
  if (rule) rule.requirementIds.forEach((id) => reqIds.add(id))
  if (req) reqIds.add(req.requirement.id)
  for (const r of g.requirements) {
    if (!reqIds.has(r.requirement.id)) continue
    out.add(r.id)
    out.add(ruleNodeId(r.ruleId))
    // A fact's own path shows only that fact, not every other fact of the same requirement.
    if (!fact) r.factIds.forEach((fid) => out.add(factNodeId(fid)))
  }
  return out
}

/** The state of every node by id, to spot which ones changed after the project updates. */
export function nodeStates(g: RulesGraph): Map<string, string> {
  const m = new Map<string, string>()
  for (const n of [...g.facts, ...g.rules, ...g.requirements]) m.set(n.id, n.state)
  return m
}
