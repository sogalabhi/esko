import type { Conflict, Finding, FindingDecision, Owner, Project, Rule, RulebookRule, Verdict } from '../types/project'
import { OWNER_LABEL } from './labels'

export type FindingFilter = 'all' | Verdict

/** A review item nobody has decided yet. */
export const isUndecidedReview = (f: Finding): boolean => f.verdict === 'review' && !f.decision

/** A review item a person called "a problem": it blocks the print like a fail does. */
export const isDecidedProblem = (f: Finding): boolean => f.verdict === 'review' && f.decision?.verdict === 'fail'

export interface CheckCounts {
  fail: number
  review: number
  pass: number
  /** Review items still waiting for a person. */
  undecided: number
}

export function checkCounts(findings: Finding[]): CheckCounts {
  return {
    fail: findings.filter((f) => f.verdict === 'fail').length,
    review: findings.filter((f) => f.verdict === 'review').length,
    pass: findings.filter((f) => f.verdict === 'pass').length,
    undecided: findings.filter(isUndecidedReview).length,
  }
}

export interface PrintVerdict {
  /** No findings at all: nothing was checked, so nothing can be called ready. */
  checked: boolean
  ready: boolean
  /** Fails plus review items a person decided are problems. */
  fail: number
  /** Undecided review items. */
  review: number
}

export function printVerdict(findings: Finding[]): PrintVerdict {
  const c = checkCounts(findings)
  const fail = c.fail + findings.filter(isDecidedProblem).length
  const review = c.undecided
  return { checked: findings.length > 0, ready: findings.length > 0 && fail === 0 && review === 0, fail, review }
}

/** Order inside a group: undecided review first, then by id order as given. */
export function orderFindings(list: Finding[]): Finding[] {
  return [...list].sort((a, b) => Number(!isUndecidedReview(a)) - Number(!isUndecidedReview(b)))
}

export const DECISION_WORD: Record<FindingDecision['verdict'], string> = { pass: "It's fine", fail: "It's a problem" }

/** The owner of the first conflict behind a finding, when there is one ("Ask someone" names them). */
export function ownerOf(f: Finding, conflicts: Conflict[]): Owner | undefined {
  return f.conflictIds.map((id) => conflicts.find((c) => c.id === id)?.owner).find(Boolean)
}

/** A short message to copy to the owner. */
export function askAboutFinding(f: Finding, owner: Owner | undefined): string {
  const who = owner ? OWNER_LABEL[owner] : 'team'
  const lines = [`Hi ${who}, could you check this before the artwork goes to print?`, '', f.title, f.whyItMatters]
  if (f.expected || f.found) lines.push(`Expected: ${f.expected ?? 'not stated'}. Found: ${f.found ?? 'not found'}.`)
  lines.push('', 'Thank you.')
  return lines.join('\n')
}

/** A rulebook rule shaped like a market rule, so RuleChip can show it. */
export function rulebookAsRule(r: RulebookRule): Rule {
  return { id: r.id, market: 'company', ref: r.id, summary: r.text, url: '', status: r.status === 'proposed' ? 'upcoming' : 'in_force' }
}

export interface ResolvedRule {
  rule: Rule
  /** Rulebook rule title, shown after the id. */
  title?: string
  /** Replaces the date status ("proposed"). */
  statusText?: string
  /** Shown in the tooltip when the rule's own quote could not be checked in the rulebook. */
  warning?: string
}

/** Look a finding's rule id up: first the market rules, then the uploaded rulebook, else just the id. */
export function resolveRule(id: string, project: Pick<Project, 'rules' | 'rulebook'>): ResolvedRule {
  const market = project.rules.find((r) => r.id === id)
  if (market) return { rule: market }
  const rb = project.rulebook?.rules.find((r) => r.id === id)
  if (rb) {
    return {
      rule: rulebookAsRule(rb),
      title: rb.title,
      statusText: rb.status === 'proposed' ? 'proposed' : undefined,
      warning: rb.source.quoteChecked ? undefined : 'The rule text could not be found in the rulebook by code, so this rule is unverified.',
    }
  }
  return { rule: { id, market: 'company', ref: id, summary: 'This rule is not in the loaded rules.', url: '', status: 'in_force' }, statusText: 'not loaded' }
}
