import { Check, CircleCheck, CircleX, FileText, Pencil, Printer, RotateCcw } from 'lucide-react'
import { useState, type ChangeEvent, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { Link } from 'react-router'
import { printVerdict } from '../lib/checks'
import { DEFAULT_BRIEF, ILLUSTRATIVE, type BriefData, type BriefRow } from '../lib/printBrief'
import { useProject } from '../state/project'

const HEADER_KEY = 'bf.printBrief.header'
const DATA_KEY = 'bf.printBrief.data'
const MAX_LOGO_BYTES = 500_000

function readHeader(): boolean {
  try {
    return window.localStorage.getItem(HEADER_KEY) !== 'off'
  } catch {
    return true
  }
}

/** The saved brief, or the defaults when nothing was saved (or it no longer has the expected shape). */
function readData(): BriefData {
  try {
    const raw = window.localStorage.getItem(DATA_KEY)
    if (!raw) return DEFAULT_BRIEF
    const saved = JSON.parse(raw) as Partial<BriefData>
    const merged = { ...DEFAULT_BRIEF, ...saved, company: { ...DEFAULT_BRIEF.company, ...saved.company } }
    return Array.isArray(merged.job) && Array.isArray(merged.print) && Array.isArray(merged.approvals) ? merged : DEFAULT_BRIEF
  } catch {
    return DEFAULT_BRIEF
  }
}

function saveData(data: BriefData | null) {
  try {
    if (data) window.localStorage.setItem(DATA_KEY, JSON.stringify(data))
    else window.localStorage.removeItem(DATA_KEY)
  } catch {
    /* the edits just aren't remembered */
  }
}

const inputCls =
  'w-full min-w-0 rounded-chip border border-border bg-white px-2 py-1 text-[13px] text-ink focus-visible:outline-2 focus-visible:outline-info'

/** A value that is text when reading and an input when editing. */
function Field({ value, editing, label, onChange, long, className = '' }: { value: string; editing: boolean; label: string; onChange: (v: string) => void; long?: boolean; className?: string }) {
  if (!editing) return <span className={className}>{value}</span>
  return long ? (
    <textarea aria-label={label} value={value} rows={3} onChange={(e) => onChange(e.target.value)} className={inputCls} />
  ) : (
    <input aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
  )
}

function Logo({ src }: { src: string | null }) {
  if (src) return <img src={src} alt="" className="h-10 max-w-[120px] object-contain" />
  return (
    <svg viewBox="0 0 40 40" width={40} height={40} aria-hidden="true">
      <rect width={40} height={40} rx={8} fill="#1f2a44" />
      <text x={20} y={27} textAnchor="middle" fontSize={20} fontWeight={700} fill="#fff" fontFamily="IBM Plex Sans, sans-serif">
        e
      </text>
    </svg>
  )
}

/** The company letterhead: logo and name. Optional (a toggle on the screen). */
function Letterhead({ data, editing, set }: { data: BriefData; editing: boolean; set: (c: Partial<BriefData['company']>) => void }) {
  const [logoError, setLogoError] = useState('')
  const c = data.company
  const upload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError('The logo must be under 500 KB.')
      return
    }
    setLogoError('')
    const reader = new FileReader()
    reader.onload = () => set({ logo: String(reader.result) })
    reader.readAsDataURL(file)
  }
  return (
    <header data-letterhead className="flex items-center justify-between gap-4 border-b-2 border-ink pb-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Logo src={c.logo} />
        <div className="min-w-0 flex-1">
          <Field value={c.name} editing={editing} label="Company name" onChange={(v) => set({ name: v })} className="block text-[20px] font-bold leading-tight tracking-tight" />
          <Field value={c.line} editing={editing} label="Company tagline" onChange={(v) => set({ line: v })} className="block text-[12px] text-ink-2" />
          {editing && (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px]">
              <label className="cursor-pointer rounded-chip border border-border bg-surface px-2 py-0.5 hover:border-ink-2">
                Upload logo
                <input type="file" accept="image/*" onChange={upload} className="sr-only" />
              </label>
              {c.logo && (
                <button type="button" onClick={() => set({ logo: null })} className="text-info underline">
                  Remove logo
                </button>
              )}
              {logoError && <span role="alert" className="text-bad">{logoError}</span>}
            </div>
          )}
        </div>
      </div>
      <Field value={c.unit} editing={editing} label="Department" onChange={(v) => set({ unit: v })} className="text-right text-[12px] font-semibold uppercase tracking-wider text-ink-2" />
    </header>
  )
}

function Rows({ rows, editing, onChange }: { rows: BriefRow[]; editing: boolean; onChange: (i: number, value: string) => void }) {
  return (
    <dl className="pb-rows divide-y divide-border border-y border-border">
      {rows.map((r, i) => (
        <div key={r.label} className="grid grid-cols-[170px_minmax(0,1fr)] items-start gap-3 py-1.5 text-[13px]">
          <dt className="font-medium text-ink-2">{r.label}</dt>
          <dd className="min-w-0">
            <Field value={r.value} editing={editing} label={r.label} onChange={(v) => onChange(i, v)} long={r.value.length > 80} />
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

type RowSection = 'job' | 'print' | 'critical' | 'order'

/**
 * The brief that goes to the printer with the approved artwork: job, print specification, critical items,
 * changes, order, approvals. Every value starts from the defaults and can be edited; edits stay in this browser.
 */
export function PrintBrief() {
  const { project } = useProject()
  const [header, setHeader] = useState(readHeader)
  const [data, setData] = useState(readData)
  const [editing, setEditing] = useState(false)
  const verdict = printVerdict(project.findings)
  const passes = project.findings.filter((f) => f.verdict === 'pass').length
  const edited = data !== DEFAULT_BRIEF

  const update = (next: BriefData) => {
    setData(next)
    saveData(next)
  }
  const setRow = (section: RowSection) => (i: number, value: string) =>
    update({ ...data, [section]: data[section].map((r, k) => (k === i ? { ...r, value } : r)) })
  const setApproval = (i: number, key: keyof BriefData['approvals'][number], value: string) =>
    update({ ...data, approvals: data.approvals.map((a, k) => (k === i ? { ...a, [key]: value } : a)) })

  const toggleHeader = () => {
    const next = !header
    setHeader(next)
    try {
      window.localStorage.setItem(HEADER_KEY, next ? 'on' : 'off')
    } catch {
      /* the choice just isn't remembered */
    }
  }
  const reset = () => {
    setData(DEFAULT_BRIEF)
    saveData(null)
  }
  // The printed brief is always the finished view, never the inputs.
  const print = () => {
    flushSync(() => setEditing(false))
    window.print()
  }

  const button = 'inline-flex items-center gap-1.5 rounded-chip border border-border bg-surface px-3 py-1.5 text-[13px] font-medium hover:border-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info'

  return (
    <div className="mx-auto max-w-[900px]">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold">Print brief</h1>
          <p className="text-[14px] text-ink-2">What goes to the printer with the approved artwork.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="mr-1 inline-flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={header} onChange={toggleHeader} className="h-4 w-4 accent-[var(--accent)]" />
            Company header
          </label>
          <button type="button" aria-pressed={editing} onClick={() => setEditing((e) => !e)} className={button}>
            {editing ? <Check size={15} aria-hidden="true" /> : <Pencil size={15} aria-hidden="true" />}
            {editing ? 'Done editing' : 'Edit details'}
          </button>
          {edited && (
            <button type="button" onClick={reset} className={button}>
              <RotateCcw size={15} aria-hidden="true" />
              Reset to defaults
            </button>
          )}
          <button
            type="button"
            onClick={print}
            className="inline-flex items-center gap-1.5 rounded-chip bg-accent px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info"
          >
            <Printer size={15} aria-hidden="true" />
            Print brief
          </button>
        </div>
      </div>

      {editing && (
        <p role="status" className="no-print mb-3 rounded-chip border border-info/40 bg-info/10 px-3 py-1.5 text-[13px]">
          Editing: changes are saved in this browser as you type. Print always uses the finished view.
        </p>
      )}

      <article aria-label="Print brief" className="print-brief rounded-card border border-border bg-surface p-8 text-ink">
        {header && <Letterhead data={data} editing={editing} set={(c) => update({ ...data, company: { ...data.company, ...c } })} />}

        <div className={`flex flex-wrap items-start justify-between gap-4 ${header ? 'mt-5' : ''}`}>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-ink-2">Print brief · artwork release to print</p>
            <p className="mt-1 text-[24px] font-bold leading-tight">{data.job[0]?.value}</p>
            {editing ? (
              <div className="mt-1 grid max-w-[520px] grid-cols-3 gap-2">
                <Field value={data.number} editing label="Brief number" onChange={(v) => update({ ...data, number: v })} />
                <Field value={data.version} editing label="Version" onChange={(v) => update({ ...data, version: v })} />
                <Field value={data.approvedOn} editing label="Approved on" onChange={(v) => update({ ...data, approvedOn: v })} />
              </div>
            ) : (
              <p className="mt-1 font-mono text-[12px] text-ink-2">
                {data.number} · version {data.version} · approved {data.approvedOn}
              </p>
            )}
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

        <p className="mt-3 rounded-chip border border-warn/50 bg-warn/10 px-3 py-1.5 text-[12px]">{ILLUSTRATIVE}</p>
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
          <Rows rows={data.job} editing={editing} onChange={setRow('job')} />
        </Section>

        <Section title="2 · Print specification">
          <Rows rows={data.print} editing={editing} onChange={setRow('print')} />
        </Section>

        <Section title="3 · Critical items: print as approved" keep>
          <p className="mb-2 text-[13px] text-ink-2">The wording of every item is in the artwork file. These must print exactly where and as they are.</p>
          <Rows rows={data.critical} editing={editing} onChange={setRow('critical')} />
        </Section>

        <Section title={`4 · What changed since the previous version`} keep>
          <Field value={data.changes} editing={editing} label="What changed" onChange={(v) => update({ ...data, changes: v })} long className="text-[13px]" />
        </Section>

        <Section title="5 · Order and delivery" keep>
          <Rows rows={data.order} editing={editing} onChange={setRow('order')} />
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
              {data.approvals.map((a, i) => (
                <tr key={i} className="border-b border-border">
                  {(['by', 'role', 'what', 'at'] as const).map((k) => (
                    <td key={k} className={`py-1.5 pr-2 ${k === 'by' ? 'font-medium' : ''} ${k === 'at' ? 'font-mono text-[12px]' : ''}`}>
                      <Field value={a[k]} editing={editing} label={`Approval ${i + 1}: ${k}`} onChange={(v) => setApproval(i, k, v)} />
                    </td>
                  ))}
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
