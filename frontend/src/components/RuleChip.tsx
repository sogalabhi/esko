import { ExternalLink, TriangleAlert } from 'lucide-react'
import { useId } from 'react'
import { marketCode, ruleStatusText } from '../lib/labels'
import type { Rule } from '../types/project'

interface Props {
  rule: Rule
  /** A rulebook rule's title, shown after its id. */
  title?: string
  /** Replaces the date status, e.g. "proposed". */
  statusText?: string
  /** Shown in the tooltip, with an icon and words, e.g. an unverified rulebook rule. */
  warning?: string
}

export function RuleChip({ rule, title, statusText, warning }: Props) {
  const tipId = useId()
  return (
    <span className="group relative inline-flex">
      <span
        tabIndex={0}
        aria-describedby={tipId}
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-chip border border-border bg-surface px-2 py-0.5 text-[12px] text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-info"
      >
        <span className="rounded-[3px] border border-ink-2 px-1 font-mono text-[11px] leading-4 text-ink-2">{marketCode(rule.market)}</span>
        <span className="font-mono">{rule.ref}</span>
        {title && <span>{title}</span>}
        <span className="text-ink-2">· {statusText ?? ruleStatusText(rule)}</span>
        {warning && (
          <>
            <TriangleAlert size={12} aria-hidden="true" className="text-warn" />
            <span className="text-warn">unverified</span>
          </>
        )}
      </span>
      <span
        id={tipId}
        role="tooltip"
        className="invisible absolute left-0 top-full z-30 mt-1 w-72 rounded-card border border-border bg-surface p-3 text-[12px] leading-5 text-ink shadow-sm group-hover:visible group-focus-within:visible"
      >
        {rule.summary}
        {warning && (
          <span className="mt-1 flex items-start gap-1 text-warn">
            <TriangleAlert size={12} aria-hidden="true" className="mt-1 shrink-0" />
            {warning}
          </span>
        )}
        {rule.url && (
          <>
            {' '}
            <a href={rule.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-info underline">
              Read the rule
              <ExternalLink size={12} aria-hidden="true" />
            </a>
          </>
        )}
      </span>
    </span>
  )
}
