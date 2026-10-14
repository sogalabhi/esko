import { CircleCheck } from 'lucide-react'
import { forwardRef, useState, type ReactNode } from 'react'
import { askMessage, KIND_LABEL, OWNER_LABEL, resolutionText, SEVERITY_LABEL, sideName } from '../lib/labels'
import { useProject } from '../state/project'
import type { Conflict, ConflictSide, ResolutionChoice } from '../types/project'
import { AskMessage } from './AskMessage'
import { RuleChip } from './RuleChip'
import { SourceChips } from './SourceChip'

const btn =
  'rounded-chip border border-border bg-surface px-2.5 py-1 text-[13px] font-medium text-ink hover:border-ink-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-info'

interface Props {
  conflict: Conflict
  onResolve: (choice: ResolutionChoice) => void
  children?: ReactNode
}

export const ConflictCard = forwardRef<HTMLElement, Props>(function ConflictCard({ conflict, onResolve, children }, ref) {
  const { project } = useProject()
  const [asking, setAsking] = useState(false)
  const files = project.files
  const rule = conflict.ruleId ? project.rules.find((r) => r.id === conflict.ruleId) : undefined
  const titleId = `conflict-${conflict.id}-title`

  if (conflict.resolution) {
    const r = conflict.resolution
    return (
      <article
        ref={ref}
        tabIndex={-1}
        data-conflict-card
        aria-labelledby={titleId}
        className="flex items-start gap-2 rounded-card border border-border bg-surface px-3 py-2 text-[13px] text-ink-2 focus-visible:outline-2 focus-visible:outline-info"
      >
        <CircleCheck size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-ok" />
        <p id={titleId}>
          <span className="sr-only">{KIND_LABEL[conflict.kind]}: </span>
          Resolved by {r.by} · {resolutionText(conflict, r.choice, files)}
        </p>
      </article>
    )
  }

  const side = (label: string, s: ConflictSide) => (
    <div className="min-w-0 rounded-chip border border-border p-2">
      <p className="text-[12px] text-ink-2">{label}</p>
      <p className="mt-0.5 break-words font-medium">{s.value}</p>
      <div className="mt-1.5">
        {s.sources.length ? (
          <SourceChips sources={s.sources} />
        ) : (
          <span className="text-[12px] text-ink-2">{conflict.kind === 'math' ? 'Computed by code' : 'Stated by the rule'}</span>
        )}
      </div>
      {s.sources[0] && <p className="mt-1.5 line-clamp-3 text-[12px] italic text-ink-2">"{s.sources[0].quote}"</p>}
    </div>
  )

  const leftName = sideName(conflict.left, conflict.kind, files)
  const rightName = sideName(conflict.right, conflict.kind, files)

  return (
    <article
      ref={ref}
      tabIndex={-1}
      data-conflict-card
      aria-labelledby={titleId}
      className="rounded-card border border-border bg-surface p-3 focus-visible:outline-2 focus-visible:outline-info"
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
        <span id={titleId} className="font-semibold text-bad">
          {KIND_LABEL[conflict.kind]}
        </span>
        <span className="text-ink-2">· {SEVERITY_LABEL[conflict.severity]} severity</span>
        <span className="text-ink-2">· Owner: {OWNER_LABEL[conflict.owner]}</span>
      </header>
      <p className="mt-1 text-[13px]">{conflict.explanation}</p>
      {rule && (
        <div className="mt-1.5">
          <RuleChip rule={rule} />
        </div>
      )}
      <div className="mt-2 grid grid-cols-2 gap-2 text-[13px]">
        {side(`Left · ${leftName}`, conflict.left)}
        {side(`Right · ${rightName}`, conflict.right)}
      </div>
      {children}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <button type="button" className={btn} onClick={() => onResolve('intended')}>
          Intended change
        </button>
        <button type="button" className={btn} onClick={() => onResolve('left')}>
          Use left
        </button>
        <button type="button" className={btn} onClick={() => onResolve('right')}>
          Use right
        </button>
        <button type="button" className={btn} aria-expanded={asking} onClick={() => setAsking((a) => !a)}>
          Ask someone
        </button>
      </div>
      {asking && (
        <AskMessage
          message={askMessage(
            conflict.owner,
            `${KIND_LABEL[conflict.kind]}: ${conflict.explanation}`,
            `${leftName}: ${conflict.left.value}\n${rightName}: ${conflict.right.value}`,
          )}
        />
      )}
    </article>
  )
})
