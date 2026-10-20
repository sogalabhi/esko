import { formatValue, marketCode, ruleStatusText, titleCase } from './labels'
import { resolveRule } from './checks'
import type { Finding, Project, Verdict } from '../types/project'

/** Product line as the top bar derives it: the statement of identity and the net quantity. */
export function productLine(project: Pick<Project, 'facts'>): string {
  const identity = project.facts.find((f) => f.field === 'Statement of identity')
  const net = project.facts.find((f) => f.field === 'Net quantity')
  return [identity?.value ? titleCase(identity.value) : 'Untitled product', net ? formatValue(net) : ''].filter(Boolean).join(' · ')
}

/** A fail the report cannot show as one: it has no evidence. It should never happen. */
export const hasNoEvidence = (f: Finding): boolean => f.verdict === 'fail' && f.evidence.length === 0

export interface RuleRow {
  id: string
  ref: string
  /** Title (rulebook) or summary (market rule). */
  label: string
  origin: string
  status: string
  /** Rulebook rule whose quote code could not find: listed, not applied. */
  unverified: boolean
  /** Not applied: unverified or proposed. */
  notApplied: boolean
  /** Verdicts of the findings that cite the rule. */
  verdicts: Verdict[]
}

/**
 * Rules behind the report: every market rule a finding cites, then every rule of the loaded rulebook
 * (so an unverified or proposed rule is visible as "not applied" instead of silently missing).
 */
export function rulesUsed(project: Pick<Project, 'rules' | 'rulebook' | 'findings'>): RuleRow[] {
  const verdictsOf = (id: string) => project.findings.filter((f) => f.ruleIds.includes(id)).map((f) => f.verdict)
  const rulebookIds = new Set(project.rulebook?.rules.map((r) => r.id) ?? [])
  const cited = [...new Set(project.findings.flatMap((f) => f.ruleIds))].filter((id) => !rulebookIds.has(id))
  const rows: RuleRow[] = cited.map((id) => {
    const r = resolveRule(id, project)
    const known = project.rules.some((x) => x.id === id)
    return {
      id,
      ref: r.rule.ref,
      label: known ? r.rule.summary : 'This rule is not in the loaded rules.',
      origin: known ? marketCode(r.rule.market) : 'Unknown',
      status: known ? ruleStatusText(r.rule) : 'not loaded',
      unverified: false,
      notApplied: false,
      verdicts: verdictsOf(id),
    }
  })
  for (const r of project.rulebook?.rules ?? []) {
    const unverified = !r.source.quoteChecked
    const proposed = r.status === 'proposed'
    rows.push({
      id: r.id,
      ref: r.id,
      label: r.title,
      origin: 'Rulebook',
      status: unverified ? 'unverified, not applied' : proposed ? 'proposed, not applied' : 'in force',
      unverified,
      notApplied: unverified || proposed,
      verdicts: verdictsOf(r.id),
    })
  }
  return rows
}
