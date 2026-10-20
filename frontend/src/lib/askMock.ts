import type { FindingAskResult } from '../api/client'
import type { AskResult, Fact, Finding, Project } from '../types/project'
import { formatValue } from './labels'

/** Stand-in for POST /api/ask on the bundled mock: answer only from facts whose field name matches a word of the question. */
export function mockAsk(question: string, facts: Fact[]): AskResult {
  const words = question.toLowerCase().match(/[a-z]{4,}/g) ?? []
  const hits = facts.filter((f) => f.value != null && words.some((w) => f.field.toLowerCase().includes(w))).slice(0, 3)
  if (hits.length === 0) {
    return { answer: 'No fact answers this, so I will not guess. Add a file or answer a question first.', factIds: [], refused: true }
  }
  return { answer: hits.map((f) => `${f.field}: ${formatValue(f)}`).join('. ') + '.', factIds: hits.map((f) => f.id) }
}

/** Stand-in for POST /api/ask with a findingId on the bundled mock: restate the finding and cite only what it carries. */
export function mockAskFinding(question: string, f: Finding, project: Pick<Project, 'facts' | 'rules' | 'rulebook'>): FindingAskResult {
  if (!question.trim()) return { answer: "This finding doesn't answer that.", factIds: [], refused: true }
  const values = f.expected != null || f.found != null ? ` Expected ${f.expected ?? 'nothing stated'}; found ${f.found ?? 'nothing'}.` : ''
  const known = new Set([...project.rules.map((r) => r.id), ...(project.rulebook?.rules.map((r) => r.id) ?? [])])
  return {
    answer: `${f.title}. ${f.whyItMatters}${values}`,
    factIds: f.factIds.filter((id) => project.facts.some((x) => x.id === id)),
    ruleIds: f.ruleIds.filter((id) => known.has(id)),
    evidence: f.evidence.map((_, i) => i),
  }
}
