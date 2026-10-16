import { GitCompareArrows } from 'lucide-react'
import { forwardRef, Fragment } from 'react'
import { SourceChips } from '../../components/SourceChip'
import { fileShort, GROUPS } from '../../lib/labels'
import { countTokens, type TrackSection, type TrackToken } from '../../lib/trackChanges'
import type { ProjectFile } from '../../types/project'

function Token({ t }: { t: TrackToken }) {
  switch (t.kind) {
    case 'ins':
      return (
        <ins data-kind="ins" className="text-info underline decoration-2 underline-offset-2" title="Only in the reference file: insert">
          <span className="sr-only">inserted: </span>
          {t.text}
        </ins>
      )
    case 'del':
      return (
        <del data-kind="del" className="text-bad line-through decoration-2" title="Only on the pack: delete">
          <span className="sr-only">deleted: </span>
          {t.text}
        </del>
      )
    case 'dup':
      return (
        <mark data-kind="dup" className="rounded-[3px] bg-warn/15 px-0.5 text-ink outline outline-1 outline-warn/60" title="Listed twice">
          {t.text}
          <sup className="ml-0.5 font-mono text-[10px] text-warn">×2</sup>
          <span className="sr-only"> (listed twice)</span>
        </mark>
      )
    case 'change':
      return (
        <span data-kind="change">
          <del className="text-bad line-through decoration-2">
            <span className="sr-only">deleted: </span>
            {t.was}
          </del>{' '}
          <ins className="text-info underline decoration-2 underline-offset-2">
            <span className="sr-only">inserted: </span>
            {t.text}
          </ins>
        </span>
      )
    default:
      return <span data-kind="same">{t.text}</span>
  }
}

interface Props {
  sections: TrackSection[]
  pack?: ProjectFile
  reference?: ProjectFile
}

export const TrackChanges = forwardRef<HTMLElement, Props>(function TrackChanges({ sections, pack, reference }, ref) {
  const from = fileShort(pack)
  const to = fileShort(reference)
  return (
    <section ref={ref} aria-labelledby="track-title" className="rounded-card border border-border bg-surface p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="track-title" className="flex items-center gap-2 text-[16px] font-semibold">
          <GitCompareArrows size={18} aria-hidden="true" />
          Track changes · {from} → {to}
        </h2>
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-2">
          <span>
            <ins className="text-info underline decoration-2 underline-offset-2">Underlined</ins> = only on the {to.toLowerCase()} (insert)
          </span>
          <span>
            <del className="text-bad line-through decoration-2">Struck</del> = only on the {from.toLowerCase()} (delete)
          </span>
          <span>
            <mark className="rounded-[3px] bg-warn/15 px-0.5 text-ink outline outline-1 outline-warn/60">Highlighted ×2</mark> = listed twice
          </span>
        </p>
      </header>
      {sections.length === 0 ? (
        <p className="mt-3 text-[13px] text-ink-2">No ingredient, allergen or claim text is on both files, so there is nothing to compare.</p>
      ) : (
        sections.map((sec) => (
          <div key={sec.group} className="mt-4">
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">{GROUPS.find((g) => g.id === sec.group)?.label ?? sec.group}</h3>
            {sec.rows.map((row) => {
              const c = countTokens(row.tokens)
              return (
                <article key={row.id} aria-label={row.label} className="mt-2 rounded-chip border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-[14px] font-medium">{row.label}</h4>
                    <p className="font-mono text-[12px] text-ink-2">
                      {c.ins} inserted · {c.del} deleted · {c.change} reworded · {c.dup} twice
                    </p>
                  </div>
                  <p className="mt-2 text-[14px] leading-7">
                    {row.tokens.map((t, i) => (
                      <Fragment key={i}>
                        {i > 0 && ', '}
                        <Token t={t} />
                      </Fragment>
                    ))}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-ink-2">
                    <span>{from}:</span>
                    <SourceChips sources={row.oldSources.slice(0, 1)} />
                    <span>{to}:</span>
                    <SourceChips sources={row.newSources.slice(0, 1)} />
                  </div>
                </article>
              )
            })}
          </div>
        ))
      )}
    </section>
  )
})
