import { createPortal } from 'react-dom'
import { formatValue, OWNER_LABEL, resolutionText, titleCase } from '../../lib/labels'
import type { MarkSet } from '../../lib/markup'
import type { BBox, PackPanel, Project } from '../../types/project'
import { MarkupCanvas, type Page } from './MarkupCanvas'
import { POSTER_CSS } from './posterCss'

interface Props {
  project: Project
  set: MarkSet
  page: Page
  image?: string | null
  panels: PackPanel[]
  hints: BBox[]
  sticky: boolean
  /** Conflicts settled in this session or by the backend. */
  settled: Project['conflicts']
}

/**
 * One A3 landscape page: the marked-up carton, a legend and the decisions taken.
 * Rendered into <body> and shown only when printing (see markup.css), so the app's controls never print.
 */
export function Poster({ project, set, page, image, panels, hints, sticky, settled }: Props) {
  const identity = project.facts.find((f) => f.field === 'Statement of identity')
  const net = project.facts.find((f) => f.field === 'Net quantity')
  const product = [identity?.value ? titleCase(identity.value) : 'Untitled product', net ? formatValue(net) : ''].filter(Boolean).join(' · ')
  const answered = project.questions.filter((q) => q.status === 'answered')
  const today = new Date().toISOString().slice(0, 10)

  return createPortal(
    <div className="bf-poster grid-cols-[1fr_100mm] gap-[8mm] bg-white text-[9pt] text-ink" aria-hidden="true" data-testid="poster">
      <style>{POSTER_CSS}</style>
      <div className="min-w-0">
        <header className="mb-[3mm] flex items-baseline justify-between border-b border-ink pb-[2mm]">
          <h1 className="text-[18pt] font-semibold">{product} · review markup</h1>
          <p className="font-mono text-[9pt]">
            {project.market ? `${project.market.toUpperCase()} · ` : ''}
            {today}
          </p>
        </header>
        <MarkupCanvas page={page} image={image} panels={panels} hints={hints} set={set} marked sticky={sticky} animate={false} interactive={false} label="Carton markup" />
        <p className="mt-[2mm] text-[8pt] text-ink-2">
          Positions in mm on the original dieline. Every mark is a finding from BriefForge with its sources checked by code.
        </p>
      </div>
      <aside className="min-w-0 space-y-[4mm] border-l border-border pl-[5mm]">
        <section>
          <h2 className="text-[11pt] font-semibold">Legend</h2>
          <ul className="mt-[1mm] space-y-[0.8mm]">
            <li>Red circle: a problem at this spot (number = the finding below)</li>
            <li>Struck through: a claim to take off or a wrong printed value</li>
            <li>Written above: the value code computed</li>
            <li>Green tick “pass”: a check that passed</li>
            {sticky && (
              <li className="flex flex-wrap gap-[2mm] pt-[1mm]">
                {(['legal', 'rnd', 'brand'] as const).map((o) => (
                  <span key={o} className="rounded-[1mm] border border-border px-[1.5mm]" style={{ background: `var(--owner-${o})` }}>
                    {OWNER_LABEL[o]}
                  </span>
                ))}
              </li>
            )}
          </ul>
        </section>
        <section>
          <h2 className="text-[11pt] font-semibold">Open findings ({set.marks.length + set.offPack.length})</h2>
          <ol className="mt-[1mm] space-y-[0.8mm]">
            {set.marks.map((m) => (
              <li key={m.conflict.id} className="flex gap-[1.5mm]">
                <span className="w-[5mm] shrink-0 text-right font-mono">{m.n}.</span>
                <span>
                  {m.conflict.explanation} <span className="text-ink-2">· {OWNER_LABEL[m.owner]}</span>
                </span>
              </li>
            ))}
            {set.offPack.map((c) => (
              <li key={c.id} className="flex gap-[1.5mm]">
                <span className="w-[5mm] shrink-0 text-right font-mono">–</span>
                <span>
                  {c.explanation} <span className="text-ink-2">· {OWNER_LABEL[c.owner]} · not on the carton</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
        <section>
          <h2 className="text-[11pt] font-semibold">Decisions ({settled.length + answered.length})</h2>
          {settled.length + answered.length === 0 ? (
            <p className="mt-[1mm] text-ink-2">No decisions yet.</p>
          ) : (
            <ul className="mt-[1mm] space-y-[0.8mm]">
              {settled.map((c) => (
                <li key={c.id}>
                  {c.explanation}{' '}
                  <span className="text-ink-2">
                    → {c.resolution ? `${resolutionText(c, c.resolution.choice, project.files)} · ${c.resolution.by}` : 'settled by an answer'}
                  </span>
                </li>
              ))}
              {answered.map((q) => (
                <li key={q.id}>
                  {q.text} <span className="text-ink-2">→ {q.answer ?? 'answered'}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>,
    document.body,
  )
}
