import { CircleAlert, CircleCheck, CircleDashed, CircleX, FileText, FileUp, Printer, Quote, ShieldCheck, TriangleAlert, UserRound } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ProofLine } from '../components/ProofLine'
import { Skeleton } from '../components/LoadGate'
import { VERDICT_LABEL, VerdictBadge } from '../components/VerdictBadge'
import { DECISION_WORD, orderFindings, printVerdict, resolveRule } from '../lib/checks'
import { KIND_LABELS } from '../lib/findingKinds'
import { marketCode, sourceLong } from '../lib/labels'
import { regionsFromFacts } from '../lib/clusters'
import { buildMarks, clusterMarks, packFileId } from '../lib/markup'
import { hasNoEvidence, productLine, rulesUsed } from '../lib/report'
import { stamp } from '../lib/time'
import { usePackZones } from '../lib/usePackZones'
import { SourcePreview } from '../shell/SourceDrawer'
import { MARKETS } from '../shell/TopBar'
import { useProject } from '../state/project'
import type { BBox, Cleared, Finding, Project, Source } from '../types/project'
import { fallbackPage } from './Markup'
import { MarkupCanvas } from './markup/MarkupCanvas'
import { guideLayers, useCartonImage } from './markup/useCartonImage'
import './markup/markup.css'
import './report.css'

const h2 = 'text-[16px] font-semibold'
const card = 'rounded-card border border-border bg-surface p-4'

/** Shown when nothing has been checked yet (LoadGate's `empty`, and when files are in but no checks ran). */
export function EmptyReport() {
  return (
    <section aria-labelledby="report-title" className="mx-auto mt-16 max-w-md rounded-card border border-border bg-surface p-8 text-center">
      <FileUp size={24} aria-hidden="true" className="mx-auto text-ink-2" />
      <h1 id="report-title" className="mt-3 text-[20px] font-semibold">
        Report
      </h1>
      <p className="mt-1 text-ink-2">No report yet: no checks have run. Add the artwork and the approved product information first.</p>
      <Link
        to="/evidence"
        className="mt-4 inline-flex items-center gap-1.5 rounded-chip bg-accent px-4 py-2 text-[14px] font-semibold text-white hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info"
      >
        Go to Files
      </Link>
    </section>
  )
}

function whereOf(source: Source, project: Project): string {
  const file = project.files.find((f) => f.id === source.fileId)
  return `${file?.name ?? 'Unknown file'} · ${sourceLong(source, file)}`
}

function EvidenceRow({ source, project, crop }: { source: Source; project: Project; crop: boolean }) {
  return (
    <li data-report-evidence className="min-w-0 rounded-chip border border-border p-2 text-[13px]">
      <p className="break-words font-mono text-[12px] text-ink-2">{whereOf(source, project)}</p>
      <p className="mt-1 flex items-start gap-1 italic">
        <Quote size={12} aria-hidden="true" className="mt-1 shrink-0 text-ink-2" />
        <span className="break-words">{source.quote}</span>
      </p>
      <p className={`mt-1 inline-flex items-center gap-1 text-[12px] font-medium ${source.quoteChecked ? 'text-ok' : 'text-ai'}`}>
        {source.quoteChecked ? <CircleCheck size={13} aria-hidden="true" /> : <CircleAlert size={13} aria-hidden="true" />}
        {source.quoteChecked ? 'Quote checked by code' : 'Quote not checked'}
      </p>
      {crop && (
        <div className="mt-2 [&_canvas]:max-h-[160px] [&_canvas]:w-auto [&_figcaption]:hidden [&_svg]:max-h-[140px] [&_table]:max-h-[140px]" data-crop>
          <SourcePreview source={source} />
        </div>
      )}
    </li>
  )
}

function RuleLines({ finding, project }: { finding: Finding; project: Project }) {
  if (finding.ruleIds.length === 0) return null
  return (
    <ul aria-label="Rules" className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
      {finding.ruleIds.map((id) => {
        const r = resolveRule(id, project)
        return (
          <li key={id} className="inline-flex flex-wrap items-center gap-1.5">
            <span className="rounded-[3px] border border-ink-2 px-1 font-mono text-[11px] leading-4 text-ink-2">{marketCode(r.rule.market)}</span>
            <span className="font-mono">{r.rule.ref}</span>
            {r.title && <span>{r.title}</span>}
            {r.statusText && <span className="text-ink-2">· {r.statusText}</span>}
            {r.warning && (
              <span className="inline-flex items-center gap-1 font-medium text-warn">
                <TriangleAlert size={12} aria-hidden="true" />
                unverified
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** One finding in the report: verdict, title, rules, expected vs found, proof, evidence with locations and a small crop. */
function ReportFinding({ finding: f, project, crops }: { finding: Finding; project: Project; crops: boolean }) {
  const titleId = `report-${f.id}`
  return (
    <article data-report-finding data-finding-id={f.id} data-verdict={f.verdict} aria-labelledby={titleId} className={card}>
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <VerdictBadge verdict={f.verdict} decision={f.decision} />
        <span className="text-[12px] text-ink-2">{KIND_LABELS[f.kind]}</span>
      </header>
      <h4 id={titleId} className="mt-1.5 text-[15px] font-semibold">
        {f.title}
      </h4>
      <p className="mt-0.5 text-[13px] text-ink-2">{f.whyItMatters}</p>
      <RuleLines finding={f} project={project} />
      {(f.expected != null || f.found != null) && (
        <dl className="mt-2 grid gap-2 text-[13px] sm:grid-cols-2">
          <div className="min-w-0 rounded-chip border border-border p-2">
            <dt className="text-[12px] text-ink-2">Expected</dt>
            <dd className="mt-0.5 break-words font-mono font-medium">{f.expected ?? 'Not stated'}</dd>
          </div>
          <div className="min-w-0 rounded-chip border border-border p-2">
            <dt className="text-[12px] text-ink-2">Found</dt>
            <dd className="mt-0.5 break-words font-mono font-medium">{f.found ?? 'Not found'}</dd>
          </div>
        </dl>
      )}
      <div className="mt-2">
        <ProofLine basis={f.basis} proof={f.proof} />
      </div>
      {f.evidence.length === 0 ? (
        <p className="mt-2 text-[13px] text-ink-2">No evidence recorded.</p>
      ) : (
        <ul aria-label={`Evidence for ${f.title}`} className="mt-2 grid gap-2 sm:grid-cols-2">
          {f.evidence.map((s, i) => (
            <EvidenceRow key={`${s.fileId}-${s.where.cell ?? s.where.panel ?? ''}-${i}`} source={s} project={project} crop={crops} />
          ))}
        </ul>
      )}
      {f.decision && (
        <p data-decision className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-chip border border-border bg-bg p-2 text-[13px]">
          <UserRound size={14} aria-hidden="true" className="text-ink-2" />
          <span className="font-medium">
            {f.decision.by} decided: {f.decision.verdict === 'pass' ? "it's fine" : "it's a problem"}
          </span>
          <time dateTime={f.decision.at} className="text-ink-2">
            {stamp(f.decision.at)}
          </time>
          {f.decision.note && <span className="basis-full text-ink-2">Note: {f.decision.note}</span>}
        </p>
      )}
    </article>
  )
}

function Section({ id, title, count, children, breakBefore = true }: { id: string; title: string; count?: number; children: ReactNode; breakBefore?: boolean }) {
  return (
    <section aria-labelledby={id} data-report-section={id} className={`mt-8 ${breakBefore ? 'report-break' : ''}`}>
      <h2 id={id} className={h2}>
        {title}{' '}
        {count != null && <span className="ml-2 font-mono text-[14px] font-normal text-ink-2">{count}</span>}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

const Empty = ({ children }: { children: ReactNode }) => (
  <p className="flex items-center gap-1.5 text-[14px] text-ink-2">
    <CircleCheck size={15} aria-hidden="true" />
    {children}
  </p>
)

function ClearedRow({ item, project }: { item: Cleared; project: Project }) {
  return (
    <li data-report-row data-cleared={item.id} className="rounded-chip border border-border p-2.5 text-[13px]">
      <p className="flex flex-wrap items-center gap-x-2">
        <ShieldCheck size={15} aria-hidden="true" className="shrink-0 text-ok" />
        <span className="font-medium">{item.title}</span>
        <span className="text-[12px] font-medium text-ok">Checked by code, not flagged</span>
      </p>
      <p className="mt-1 font-mono text-[12px]">{item.proof}</p>
      {item.evidence.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-[12px] text-ink-2">
          {item.evidence.map((s, i) => (
            <li key={i} className="break-words">
              {whereOf(s, project)}: <span className="italic">{s.quote}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

/** The carton with every fail and review mark, drawn from the same pieces as Marked-up artwork. */
function ArtworkMarkup({ project }: { project: Project }) {
  const { source } = useProject()
  const mockMode = source === 'mock'
  const packId = packFileId(project)
  const packFile = project.files.find((f) => f.id === packId)
  const hide = useMemo(() => guideLayers(packFile?.skipped ?? []), [packFile])
  const img = useCartonImage(packId, !mockMode && !!packId, 0, hide)
  const set = useMemo(() => buildMarks(project, packId ?? '', mockMode), [project, packId, mockMode])
  const zones = usePackZones(mockMode, packId)
  const regions = useMemo(() => [...zones, ...(packId ? regionsFromFacts(project.facts, packId) : [])], [zones, project.facts, packId])
  const groups = useMemo(() => clusterMarks(set.marks, regions), [set.marks, regions])
  const hints: BBox[] = useMemo(
    () => project.facts.flatMap((f) => f.sources.filter((s) => s.fileId === packId && s.where.bbox).map((s) => s.where.bbox as BBox)),
    [project.facts, packId],
  )
  if (!packId) return <Empty>There is no carton PDF among the files, so there is nothing to mark up.</Empty>
  const page = img.status === 'ready' ? { w: img.w, h: img.h } : fallbackPage(project, packId)
  const total = set.marks.length + set.offPack.length
  return (
    <>
      {img.status === 'error' && (
        <p role="alert" className="mb-2 flex items-start gap-1.5 rounded-chip border border-warn/40 bg-warn/10 px-3 py-2 text-[13px]">
          <TriangleAlert size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-warn" />
          The carton PDF could not be drawn: {img.reason}. The marks sit on the panel outlines instead.
        </p>
      )}
      {total === 0 ? (
        <Empty>Nothing to mark: no fail or review check has a spot on the carton.</Empty>
      ) : (
        <figure aria-labelledby="markup-caption" className="overflow-hidden rounded-card border border-border bg-surface">
          {img.status === 'loading' ? (
            <div role="status" aria-label="Drawing the carton from the PDF" className="relative w-full" style={{ aspectRatio: `${page.w + 168} / ${page.h}` }}>
              <span className="sr-only">Drawing the carton from the PDF…</span>
              <Skeleton className="absolute inset-[5%_14%] h-auto rounded-card" />
            </div>
          ) : (
            <MarkupCanvas
              page={page}
              image={img.status === 'ready' ? img.url : null}
              panels={project.pack.panels}
              hints={hints}
              set={set}
              groups={groups}
              marked
              sticky={false}
              animate={false}
              interactive={false}
              label="Carton markup"
            />
          )}
          <figcaption id="markup-caption" className="border-t border-border px-3 py-2 text-[12px] text-ink-2">
            {packFile?.name ?? 'Carton'} · fail and review marks, positions in mm. The numbered list below says what each mark is.
          </figcaption>
        </figure>
      )}
      {total > 0 && (
        <ol aria-label="Marks on the carton" data-marks-list className="mt-3 space-y-1 text-[13px]">
          {set.marks.map((m) => (
            <li key={m.conflict.id} data-mark-item={m.conflict.id} className="flex flex-wrap items-center gap-2">
              <span className="w-6 shrink-0 text-right font-mono tabular-nums text-ink-2">{m.n}.</span>
              <VerdictBadge verdict={m.verdict} decision={m.finding?.decision} />
              <span>{m.conflict.explanation}</span>
              <span className="text-ink-2">· {[...new Set(m.conflict.locations.filter((l) => l.fileId === packId).map((l) => l.panel))].join(', ')}</span>
            </li>
          ))}
          {set.offPack.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2">
              <span className="w-6 shrink-0 text-right font-mono text-ink-2">–</span>
              <span>{c.explanation}</span>
              <span className="text-ink-2">· not on the carton</span>
            </li>
          ))}
        </ol>
      )}
    </>
  )
}

/** Print approval report (P2 Phase 5). */
export function Report() {
  const { project, market } = useProject()
  const [today] = useState(() => new Date())
  const findings = project.findings
  const v = printVerdict(findings)
  const sorted = (verdict: Finding['verdict']) => orderFindings(findings.filter((f) => f.verdict === verdict))
  const dataProblems = findings.filter(hasNoEvidence)
  const fails = sorted('fail').filter((f) => !hasNoEvidence(f))
  const reviews = sorted('review')
  const passes = sorted('pass')
  const undecided = reviews.filter((f) => !f.decision)
  const decided = findings.filter((f) => f.decision).sort((a, b) => Date.parse(a.decision!.at) - Date.parse(b.decision!.at))
  const rules = useMemo(() => rulesUsed(project), [project])
  const artwork = project.files.filter((f) => f.role === 'artwork')
  const approved = project.files.filter((f) => f.role === 'approved_info')
  const marketName = MARKETS.find((m) => m.id === market)?.label ?? market
  const date = today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const names = (list: typeof artwork) => (list.length ? list.map((f) => f.name).join(', ') : 'Not set')

  if (findings.length === 0) return <EmptyReport />

  let VerdictIcon = CircleDashed
  let tone = 'text-ink-2 border-border'
  let line = ''
  if (v.ready) {
    VerdictIcon = CircleCheck
    tone = 'text-ok border-ok/40 bg-ok/10'
    line = 'Ready to print'
  } else {
    VerdictIcon = v.fail ? CircleX : CircleAlert
    tone = v.fail ? 'text-bad border-bad/40 bg-bad/10' : 'text-warn border-warn/40 bg-warn/10'
    line = `Not ready to print: ${v.fail} fail · ${v.review} review`
  }

  const meta: [string, string][] = [
    ['Product', productLine(project)],
    ['Artwork file', names(artwork)],
    ['Approved information', names(approved)],
    ['Rulebook', project.rulebook ? project.rulebook.name : 'No rulebook loaded'],
    ['Market', marketName],
    ['Date', date],
  ]

  return (
    <article aria-labelledby="report-title" className="report-doc mx-auto max-w-[900px]">
      <header>
        <div className="no-print flex flex-wrap items-start justify-between gap-3">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">Print approval report</p>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-chip bg-accent px-4 py-2 text-[14px] font-semibold text-white hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info"
          >
            <Printer size={16} aria-hidden="true" />
            Print report
          </button>
        </div>
        <p className="hidden text-[10pt] font-semibold uppercase tracking-wide print:block">Print approval report</p>
        <h1 id="report-title" className="mt-1 flex items-center gap-2 text-[20px] font-semibold">
          <FileText size={20} aria-hidden="true" className="text-ink-2" />
          Report
        </h1>
        <dl data-report-meta className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {meta.map(([k, val]) => (
            <div key={k} className="min-w-0">
              <dt className="text-[12px] text-ink-2">{k}</dt>
              <dd className="break-words text-[14px] font-medium">{val}</dd>
            </div>
          ))}
        </dl>
        <p data-report-verdict className={`mt-4 flex flex-wrap items-center gap-2 rounded-card border px-4 py-3 text-[18px] font-semibold ${tone}`}>
          <VerdictIcon size={22} aria-hidden="true" />
          {line}
        </p>
        <p className="mt-2 text-[13px] text-ink-2">
          <span className="font-mono">{fails.length + dataProblems.length}</span> fail · <span className="font-mono">{reviews.length}</span> needs review (
          <span className="font-mono">{undecided.length}</span> not decided yet) · <span className="font-mono">{passes.length}</span> pass ·{' '}
          <span className="font-mono">{project.cleared.length}</span> checked and fine. A review item a person decided is a problem counts as a fail in the line
          above.
        </p>
      </header>

      {dataProblems.length > 0 && (
        <section aria-labelledby="data-problem" role="alert" className="mt-6 rounded-card border border-bad/40 bg-bad/10 p-4">
          <h2 id="data-problem" className="flex items-center gap-1.5 text-[16px] font-semibold">
            <CircleAlert size={16} aria-hidden="true" />
            Data problem
          </h2>
          <p className="mt-1 text-[14px]">
            {dataProblems.length} result{dataProblems.length === 1 ? ' has' : 's have'} no evidence, so {dataProblems.length === 1 ? 'it is' : 'they are'} not shown as
            {dataProblems.length === 1 ? ' a fail' : ' fails'}. This should not happen; tell whoever runs the checker.
          </p>
          <ul className="mt-1 list-disc pl-5 text-[14px]">
            {dataProblems.map((f) => (
              <li key={f.id}>{f.title}</li>
            ))}
          </ul>
        </section>
      )}

      <Section id="rep-fail" title="Fail" count={fails.length} breakBefore={fails.length > 0}>
        {fails.length === 0 ? (
          <Empty>Nothing failed.</Empty>
        ) : (
          <ul className="space-y-3">
            {fails.map((f) => (
              <li key={f.id}>
                <ReportFinding finding={f} project={project} crops />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="rep-review" title="Needs review" count={reviews.length} breakBefore={reviews.length > 0}>
        {reviews.length === 0 ? (
          <Empty>Nothing needs a person.</Empty>
        ) : (
          <>
            <p className="mb-3 text-[13px] text-ink-2">
              {undecided.length === 0 ? 'Every item has been decided by a person.' : `${undecided.length} still waiting for a person; they come first.`}
            </p>
            <ul className="space-y-3">
              {reviews.map((f) => (
                <li key={f.id}>
                  <ReportFinding finding={f} project={project} crops />
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section id="rep-pass" title="Pass" count={passes.length} breakBefore={passes.length + project.cleared.length > 0}>
        {passes.length === 0 ? (
          <Empty>Nothing passed yet.</Empty>
        ) : (
          <ul className="space-y-1.5">
            {passes.map((f) => (
              <li key={f.id} data-report-row data-finding-id={f.id} data-verdict="pass" className="rounded-chip border border-border p-2.5 text-[13px]">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <VerdictBadge verdict="pass" />
                  <span className="font-medium">{f.title}</span>
                  {f.ruleIds.length > 0 && <span className="font-mono text-[12px] text-ink-2">{f.ruleIds.join(', ')}</span>}
                </p>
                {f.proof && <p className="mt-1 font-mono text-[12px]">{f.proof}</p>}
                {f.evidence.length > 0 && <p className="mt-0.5 break-words text-[12px] text-ink-2">Found at {f.evidence.map((s) => whereOf(s, project)).join('; ')}</p>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="rep-cleared" title="Checked and fine" count={project.cleared.length} breakBefore={false}>
        {project.cleared.length === 0 ? (
          <Empty>Nothing was checked and cleared without a flag.</Empty>
        ) : (
          <>
            <p className="mb-3 text-[13px] text-ink-2">Looked like a problem, checked by code, not flagged. Each has its proof.</p>
            <ul className="space-y-1.5">
              {project.cleared.map((c) => (
                <ClearedRow key={c.id} item={c} project={project} />
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section id="rep-artwork" title="Marked-up artwork">
        <ArtworkMarkup project={project} />
      </Section>

      <Section id="rep-rules" title="Rules used" count={rules.length}>
        {rules.length === 0 ? (
          <Empty>No rule is cited and no rulebook is loaded.</Empty>
        ) : (
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-ink text-[12px] text-ink-2">
                <th scope="col" className="py-1 pr-2 font-medium">
                  Rule
                </th>
                <th scope="col" className="py-1 pr-2 font-medium">
                  Source
                </th>
                <th scope="col" className="py-1 pr-2 font-medium">
                  Status
                </th>
                <th scope="col" className="py-1 font-medium">
                  Results
                </th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={`${r.origin}-${r.id}`} data-report-row data-rule={r.id} data-unverified={r.unverified || undefined} className="border-b border-border align-top">
                  <td className="py-1.5 pr-2">
                    <span className="font-mono">{r.ref}</span> <span>{r.label}</span>
                  </td>
                  <td className="py-1.5 pr-2">{r.origin}</td>
                  <td className="py-1.5 pr-2">
                    {r.notApplied ? (
                      <span className="inline-flex items-center gap-1 font-medium text-warn">
                        <TriangleAlert size={13} aria-hidden="true" />
                        {r.status}
                      </span>
                    ) : (
                      r.status
                    )}
                  </td>
                  <td className="py-1.5">
                    {r.verdicts.length === 0
                      ? 'No result'
                      : (['fail', 'review', 'pass'] as const)
                          .filter((x) => r.verdicts.includes(x))
                          .map((x) => `${VERDICT_LABEL[x]} ${r.verdicts.filter((y) => y === x).length}`)
                          .join(' · ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section id="rep-decisions" title="Decisions log" count={decided.length}>
        {decided.length === 0 ? (
          <Empty>No review decision has been made yet.</Empty>
        ) : (
          <ol className="space-y-1.5">
            {decided.map((f) => (
              <li key={f.id} data-report-row data-decision-of={f.id} className="rounded-chip border border-border p-2.5 text-[13px]">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <time dateTime={f.decision!.at} className="font-mono text-[12px] text-ink-2">
                    {stamp(f.decision!.at)}
                  </time>
                  <span className="font-medium">{f.decision!.by}</span>
                  <span>{DECISION_WORD[f.decision!.verdict]}</span>
                  <span className="text-ink-2">· {f.title}</span>
                </p>
                {f.decision!.note && <p className="mt-0.5 text-ink-2">Note: {f.decision!.note}</p>}
              </li>
            ))}
          </ol>
        )}
      </Section>

      <section aria-labelledby="rep-signoff" data-signoff className="mt-10 border-t-2 border-ink pt-4">
        <h2 id="rep-signoff" className={h2}>
          Sign-off
        </h2>
        <p className="mt-6 flex flex-wrap items-end gap-x-3 gap-y-6 text-[14px]">
          <span>Approved for print by</span>
          <span aria-hidden="true" className="inline-block h-6 w-72 border-b border-ink" />
          <span>date</span>
          <span aria-hidden="true" className="inline-block h-6 w-40 border-b border-ink" />
        </p>
        <p className="mt-1 text-[12px] text-ink-2">Both lines are left blank on purpose: sign the printed report.</p>
      </section>
    </article>
  )
}
