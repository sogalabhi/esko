import { CircleCheck, CircleX, FileText, Printer } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { printVerdict } from '../lib/checks'
import { BRIEF, COMPANY, type BriefRow } from '../lib/printBrief'
import { useProject } from '../state/project'

const HEADER_KEY = 'bf.printBrief.header'

function readHeader(): boolean {
  try {
    return window.localStorage.getItem(HEADER_KEY) !== 'off'
  } catch {
    return true
  }
}

/** The company letterhead: logo and name. Optional (a toggle on the screen). */
function Letterhead() {
  return (
    <header data-letterhead className="flex items-center justify-between gap-4 border-b-2 border-ink pb-3">
      <div className="flex items-center gap-3">
        <svg viewBox="0 0 40 40" width={40} height={40} aria-hidden="true">
          <rect width={40} height={40} rx={8} fill="#1f2a44" />
          <text x={20} y={27} textAnchor="middle" fontSize={20} fontWeight={700} fill="#fff" fontFamily="IBM Plex Sans, sans-serif">
            e
          </text>
        </svg>
        <div>
          <p className="text-[20px] font-bold leading-tight tracking-tight">{COMPANY.name}</p>
          <p className="text-[12px] text-ink-2">{COMPANY.line}</p>
        </div>
      </div>
      <p className="text-right text-[12px] font-semibold uppercase tracking-wider text-ink-2">{COMPANY.unit}</p>
    </header>
  )
}

function Rows({ rows }: { rows: BriefRow[] }) {
  return (
    <dl className="pb-rows divide-y divide-border border-y border-border">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[170px_minmax(0,1fr)] gap-3 py-1.5 text-[13px]">
          <dt className="font-medium text-ink-2">{r.label}</dt>
          <dd className="min-w-0">
            {r.value}
            {r.note && <span className="block text-[12px] text-ink-2">{r.note}</span>}
            {r.fromFile && <span className="ml-1.5 rounded-chip bg-bg px-1.5 text-[11px] text-ink-2">read from the artwork file</span>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** `keep`: a short block that should not split across printed pages. */
function Section({ title, keep, children }: { title: string; keep?: boolean; children: ReactNode }) {
  return (
    <section className={`pb-section mt-5 ${keep ? 'pb-keep' : ''}`}>
      <h2 className="pb-h2 mb-2 text-[15px] font-semibold uppercase tracking-wide">{title}</h2>
      {children}
    </section>
  )
}

/** The brief that goes to the printer with the approved artwork: label content, print specification, approvals. */
export function PrintBrief() {
  const { project } = useProject()
  const [header, setHeader] = useState(readHeader)
  const verdict = printVerdict(project.findings)
  const passes = project.findings.filter((f) => f.verdict === 'pass').length

  const toggleHeader = () => {
    const next = !header
    setHeader(next)
    try {
      window.localStorage.setItem(HEADER_KEY, next ? 'on' : 'off')
    } catch {
      /* the choice just isn't remembered */
    }
  }

  return (
    <div className="mx-auto max-w-[900px]">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold">Print brief</h1>
          <p className="text-[14px] text-ink-2">What goes to the printer with the approved artwork.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={header} onChange={toggleHeader} className="h-4 w-4 accent-[var(--accent)]" />
            Company header
          </label>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-chip bg-accent px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info"
          >
            <Printer size={15} aria-hidden="true" />
            Print brief
          </button>
        </div>
      </div>

      <article aria-label="Print brief" className="print-brief rounded-card border border-border bg-surface p-8 text-ink">
        {header && <Letterhead />}

        <div className={`flex flex-wrap items-start justify-between gap-4 ${header ? 'mt-5' : ''}`}>
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-ink-2">Print brief · artwork release to print</p>
            <p className="mt-1 text-[24px] font-bold leading-tight">{BRIEF.job[0].value}</p>
            <p className="mt-1 font-mono text-[12px] text-ink-2">
              {BRIEF.number} · version {BRIEF.version} · approved {BRIEF.approvedOn}
            </p>
          </div>
          {verdict.ready ? (
            <p className="inline-flex items-center gap-1.5 rounded-chip border border-ok/50 bg-ok/10 px-3 py-1.5 text-[14px] font-semibold text-ok">
              <CircleCheck size={16} aria-hidden="true" />
              Released for print
            </p>
          ) : (
            <p className="inline-flex items-center gap-1.5 rounded-chip border border-bad/50 bg-bad/10 px-3 py-1.5 text-[14px] font-semibold text-bad">
              <CircleX size={16} aria-hidden="true" />
              Not released: {verdict.fail} fail · {verdict.review} review
            </p>
          )}
        </div>

        <p className="mt-3 rounded-chip border border-warn/50 bg-warn/10 px-3 py-1.5 text-[12px]">{BRIEF.illustrative}</p>
        {!verdict.ready && (
          <p className="mt-2 text-[13px] text-bad">
            The artwork has open findings, so this brief is a draft. See the{' '}
            <Link to="/checks" className="underline">
              Checks
            </Link>
            .
          </p>
        )}

        <Section title="1 · Job">
          <Rows rows={BRIEF.job} />
        </Section>

        <Section title="2 · Print specification">
          <Rows rows={BRIEF.print} />
        </Section>

        <Section title="3 · Critical items: print as approved" keep>
          <p className="mb-2 text-[13px] text-ink-2">The wording of every item is in the artwork file. These must print exactly where and as they are.</p>
          <Rows rows={BRIEF.critical} />
        </Section>

        <Section title="4 · What changed since v1" keep>
          <p className="text-[13px]">{BRIEF.changes}</p>
        </Section>

        <Section title="5 · Order and delivery" keep>
          <Rows rows={BRIEF.order} />
        </Section>

        <Section title="6 · Checks and approvals" keep>
          <p className="mb-2 flex items-center gap-1.5 text-[13px]">
            <FileText size={14} aria-hidden="true" className="text-ink-2" />
            Checks on this artwork: {verdict.fail} fail · {verdict.review} needs review · {passes} pass. Full evidence in the{' '}
            <Link to="/report" className="underline">
              print approval report
            </Link>
            .
          </p>
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-ink text-[12px] text-ink-2">
                <th className="py-1 font-medium">Approved by</th>
                <th className="py-1 font-medium">Role</th>
                <th className="py-1 font-medium">Approved</th>
                <th className="py-1 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {BRIEF.approvals.map((a) => (
                <tr key={a.by} className="border-b border-border">
                  <td className="py-1.5 font-medium">{a.by}</td>
                  <td className="py-1.5">{a.role}</td>
                  <td className="py-1.5">{a.what}</td>
                  <td className="py-1.5 font-mono text-[12px]">{a.at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="7 · Printer acknowledgement" keep>
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 pt-2 text-[13px] sm:grid-cols-3">
            {['Received by (printer)', 'Signature', 'Date'].map((l) => (
              <div key={l}>
                <div className="h-7 border-b border-ink" />
                <p className="mt-1 text-[12px] text-ink-2">{l}</p>
              </div>
            ))}
          </div>
        </Section>
      </article>
    </div>
  )
}
