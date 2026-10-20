import { ChevronDown, ChevronUp, CircleAlert, CircleCheck, MapPin, Quote, UserRound } from 'lucide-react'
import { forwardRef, useState } from 'react'
import { Link } from 'react-router'
import { resolveRule } from '../lib/checks'
import { KIND_LABELS } from '../lib/findingKinds'
import { stamp } from '../lib/time'
import { SourcePreview } from '../shell/SourceDrawer'
import { useProject } from '../state/project'
import type { Finding, Source } from '../types/project'
import { ProofLine } from './ProofLine'
import { ReviewDecision } from './ReviewDecision'
import { RuleChip } from './RuleChip'
import { SourceChip } from './SourceChip'
import { VerdictBadge } from './VerdictBadge'

function Evidence({ source, preview }: { source: Source; preview: boolean }) {
  return (
    <li data-evidence className="min-w-0 rounded-chip border border-border p-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <SourceChip source={source} />
        {source.quoteChecked ? (
          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-ok">
            <CircleCheck size={13} aria-hidden="true" />
            Quote checked by code
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-ai">
            <CircleAlert size={13} aria-hidden="true" />
            Quote not checked
          </span>
        )}
      </div>
      <p className="mt-1.5 flex items-start gap-1 text-[13px] italic text-ink-2">
        <Quote size={12} aria-hidden="true" className="mt-1 shrink-0" />
        <span className="break-words">{source.quote}</span>
      </p>
      {preview && (
        <div className="mt-2 [&_canvas]:max-h-[200px] [&_canvas]:w-auto [&_figcaption]:hidden [&_svg]:max-h-[170px] [&_table]:max-h-[170px]" data-crop>
          <SourcePreview source={source} />
        </div>
      )}
    </li>
  )
}

function Decided({ finding }: { finding: Finding }) {
  const d = finding.decision
  if (!d) return null
  return (
    <div data-decision className="mt-3 rounded-card border border-border bg-bg p-3 text-[13px]">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <UserRound size={14} aria-hidden="true" className="text-ink-2" />
        <span className="font-medium">
          {d.by} decided: {d.verdict === 'pass' ? "it's fine" : "it's a problem"}
        </span>
        <time dateTime={d.at} className="text-ink-2">
          {stamp(d.at)}
        </time>
      </p>
      {d.note && <p className="mt-1 text-ink-2">Note: {d.note}</p>}
    </div>
  )
}

/**
 * One check result: verdict, why it matters, the rules, the evidence (chips, quotes and crops side by side),
 * expected vs found, the proof, and a link to the mark on the artwork. Review items carry the decision controls.
 */
export const FindingCard = forwardRef<HTMLElement, { finding: Finding; /** Hide "Show on artwork" (the card already sits beside the artwork). */ hideLocate?: boolean }>(function FindingCard({ finding: f, hideLocate }, ref) {
  const { project } = useProject()
  const [crops, setCrops] = useState(f.verdict !== 'pass')
  const titleId = `finding-${f.id}-title`
  const hasValues = f.expected != null || f.found != null

  return (
    <article
      ref={ref}
      tabIndex={-1}
      data-finding-card
      data-finding-id={f.id}
      data-verdict={f.verdict}
      aria-labelledby={titleId}
      className="rounded-card border border-border bg-surface p-4 focus-visible:outline-2 focus-visible:outline-info"
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <VerdictBadge verdict={f.verdict} decision={f.decision} />
        <span className="text-[12px] text-ink-2">{KIND_LABELS[f.kind]}</span>
      </header>
      <h3 id={titleId} className="mt-1.5 text-[16px] font-semibold">
        {f.title}
      </h3>
      <p className="mt-1 text-[14px] text-ink-2">{f.whyItMatters}</p>

      {f.ruleIds.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Rules">
          {f.ruleIds.map((id) => {
            const r = resolveRule(id, project)
            return <RuleChip key={id} rule={r.rule} title={r.title} statusText={r.statusText} warning={r.warning} />
          })}
        </div>
      )}

      {hasValues && (
        <dl className="mt-3 grid gap-2 text-[13px] sm:grid-cols-2">
          <div data-expected className="min-w-0 rounded-chip border border-border p-2">
            <dt className="text-[12px] text-ink-2">Expected</dt>
            <dd className="mt-0.5 break-words font-mono font-medium">{f.expected ?? 'Not stated'}</dd>
          </div>
          <div data-found className="min-w-0 rounded-chip border border-border p-2">
            <dt className="text-[12px] text-ink-2">Found</dt>
            <dd className="mt-0.5 break-words font-mono font-medium">{f.found ?? 'Not found'}</dd>
          </div>
        </dl>
      )}

      <div className="mt-3">
        <ProofLine basis={f.basis} proof={f.proof} />
      </div>

      <section aria-label={`Evidence for ${f.title}`} className="mt-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-[12px] font-semibold text-ink-2">Evidence ({f.evidence.length})</h4>
          {f.evidence.length > 0 && (
            <button
              type="button"
              aria-expanded={crops}
              onClick={() => setCrops((c) => !c)}
              className="inline-flex items-center gap-1 rounded-chip px-1.5 py-0.5 text-[12px] font-medium text-info hover:underline focus-visible:outline-2 focus-visible:outline-info"
            >
              {crops ? <ChevronUp size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />}
              {crops ? 'Hide crops' : 'Show crops'}
            </button>
          )}
        </div>
        <ul className="mt-1.5 grid gap-2 md:grid-cols-2">
          {f.evidence.map((s, i) => (
            <Evidence key={`${s.fileId}-${s.where.cell ?? s.where.panel ?? ''}-${i}`} source={s} preview={crops} />
          ))}
        </ul>
      </section>

      {f.locations.length > 0 && !hideLocate && (
        <p className="mt-3">
          <Link
            to={`/markup?finding=${encodeURIComponent(f.id)}`}
            className="inline-flex items-center gap-1.5 rounded-chip border border-border bg-surface px-2.5 py-1 text-[13px] font-medium hover:border-ink-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-info"
          >
            <MapPin size={14} aria-hidden="true" />
            Show on artwork
          </Link>
        </p>
      )}

      {f.decision ? <Decided finding={f} /> : f.verdict === 'review' && <ReviewDecision finding={f} />}
    </article>
  )
})
