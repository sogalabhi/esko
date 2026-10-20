import { CircleAlert, CircleCheck, CircleX, type LucideIcon } from 'lucide-react'
import type { FindingDecision, Verdict } from '../types/project'

const VERDICTS: Record<Verdict, { label: string; Icon: LucideIcon; cls: string }> = {
  fail: { label: 'Fail', Icon: CircleX, cls: 'text-bad bg-bad/10' },
  review: { label: 'Needs review', Icon: CircleAlert, cls: 'text-warn bg-warn/10' },
  pass: { label: 'Pass', Icon: CircleCheck, cls: 'text-ok bg-ok/10' },
}

export const VERDICT_LABEL: Record<Verdict, string> = { fail: 'Fail', review: 'Needs review', pass: 'Pass' }
export const VERDICT_ORDER: Verdict[] = ['fail', 'review', 'pass']

/**
 * A finding's verdict: icon and word, never colour alone. A review item a person has decided shows the
 * decision in words ("Decided: fine" / "Decided: a problem") with the matching icon.
 */
export function VerdictBadge({ verdict, decision }: { verdict: Verdict; decision?: FindingDecision }) {
  const base = VERDICTS[verdict]
  const decided = verdict === 'review' && decision
  const { Icon, cls } = decided ? VERDICTS[decision.verdict === 'pass' ? 'pass' : 'fail'] : base
  const label = decided ? (decision.verdict === 'pass' ? 'Decided: fine' : 'Decided: a problem') : base.label
  return (
    <span
      data-verdict={verdict}
      data-decided={decided ? decision.verdict : undefined}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-chip px-2 py-0.5 text-[12px] font-medium ${cls}`}
    >
      <Icon size={14} aria-hidden="true" strokeWidth={2} />
      {label}
    </span>
  )
}
