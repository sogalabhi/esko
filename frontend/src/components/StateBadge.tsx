import { CircleCheck, CircleDashed, ShieldCheck, Sparkles, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { FactState } from '../types/project'

export type BadgeState = FactState | 'conflict'

const STATES: Record<BadgeState, { label: string; Icon: LucideIcon; cls: string }> = {
  confirmed: { label: 'Confirmed', Icon: CircleCheck, cls: 'text-ok bg-ok/10' },
  ai_suggested: { label: 'AI-suggested', Icon: Sparkles, cls: 'text-ai bg-ai/10' },
  missing: { label: 'Missing', Icon: CircleDashed, cls: 'text-warn bg-warn/10' },
  conflict: { label: 'Conflict', Icon: TriangleAlert, cls: 'text-bad bg-bad/10' },
  pass: { label: 'Pass', Icon: ShieldCheck, cls: 'text-ok bg-ok/10' },
}

export const BADGE_STATES = Object.keys(STATES) as BadgeState[]

export function stateLabel(state: BadgeState): string {
  return STATES[state].label
}

export function StateBadge({ state }: { state: BadgeState }) {
  const { label, Icon, cls } = STATES[state]
  return (
    <span
      data-state={state}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-chip px-2 py-0.5 text-[12px] font-medium ${cls}`}
    >
      <Icon size={14} aria-hidden="true" strokeWidth={2} />
      {label}
    </span>
  )
}
