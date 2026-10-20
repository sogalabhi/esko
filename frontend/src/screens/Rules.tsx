import { BookCheck, CircleAlert, CircleCheck, ExternalLink, FilePen, LoaderCircle, Quote, RotateCcw, ShieldCheck, TriangleAlert, Trash2, Upload } from 'lucide-react'
import { useId, useRef, useState, type DragEvent } from 'react'
import { Link } from 'react-router'
import { api, isRulebookFile, RULEBOOK_ACCEPT_ATTR } from '../api/client'
import { LoadError, LoadingSkeleton, Skeleton } from '../components/LoadGate'
import { SourceChip } from '../components/SourceChip'
import { VerdictBadge } from '../components/VerdictBadge'
import { ruleStatusText } from '../lib/labels'
import { CHECK_TYPE_LABEL, sourceWhere } from '../lib/rulebook'
import { useProject } from '../state/project'
import type { Finding, Project, Rule, RulebookRule } from '../types/project'

const btn =
  'inline-flex items-center gap-1.5 rounded-chip border border-border bg-surface px-3 py-1.5 text-[13px] font-medium hover:border-ink-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-info disabled:cursor-not-allowed disabled:opacity-60'

/** The findings a rule produced, as links that open that card on Checks. */
function FindingLinks({ ids, findings, none }: { ids: string[]; findings: Finding[]; none: string }) {
  if (ids.length === 0) return <p className="text-[13px] text-ink-2">{none}</p>
  return (
    <ul className="space-y-1" aria-label="Findings from this rule">
      {ids.map((id) => {
        const f = findings.find((x) => x.id === id)
        return (
          <li key={id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
            {f && <VerdictBadge verdict={f.verdict} decision={f.decision} />}
            <Link
              to={`/checks?finding=${encodeURIComponent(id)}`}
              className="font-medium text-info underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-info"
            >
              {f?.title ?? id}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function MarketRuleRow({ rule, findings }: { rule: Rule; findings: Finding[] }) {
  const ids = findings.filter((f) => f.ruleIds.includes(rule.id)).map((f) => f.id)
  return (
    <li data-market-rule={rule.id} className="rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="rounded-[3px] border border-ink-2 px-1 font-mono text-[11px] leading-4 text-ink-2">{rule.market === 'company' ? 'Company' : rule.market}</span>
        <span className="font-mono text-[14px] font-semibold">{rule.ref}</span>
        <span className="inline-flex items-center gap-1 text-[12px] font-medium text-ok">
          <ShieldCheck size={13} aria-hidden="true" />
          {rule.status === 'in_force' ? 'In force' : ruleStatusText(rule)}
        </span>
      </div>
      <p className="mt-1 text-[14px]">{rule.summary}</p>
      {rule.url && (
        <a href={rule.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[13px] text-info underline focus-visible:outline-2 focus-visible:outline-info">
          Read the rule
          <ExternalLink size={12} aria-hidden="true" />
        </a>
      )}
      <div className="mt-2">
        <FindingLinks ids={ids} findings={findings} none="No finding from this rule." />
      </div>
    </li>
  )
}

function RulebookRuleCard({ rule: r, project }: { rule: RulebookRule; project: Project }) {
  const file = project.files.find((f) => f.id === r.source.fileId)
  const proposed = r.status === 'proposed'
  const verified = r.source.quoteChecked
  const titleId = `rule-${r.id}-title`
  return (
    <article
      aria-labelledby={titleId}
      data-rulebook-rule={r.id}
      data-state={proposed ? 'proposed' : verified ? 'verified' : 'unverified'}
      className="rounded-card border border-border bg-surface p-4"
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-mono text-[14px] font-semibold">{r.id}</span>
        {proposed ? (
          <span className="inline-flex items-center gap-1 rounded-chip bg-warn/10 px-2 py-0.5 text-[12px] font-medium text-warn">
            <FilePen size={13} aria-hidden="true" />
            Proposed — not applied
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-chip bg-ok/10 px-2 py-0.5 text-[12px] font-medium text-ok">
            <ShieldCheck size={13} aria-hidden="true" />
            In force
          </span>
        )}
      </header>
      <h3 id={titleId} className="mt-1 text-[16px] font-semibold">
        {r.title}
      </h3>
      <p className="mt-1 text-[14px]">{r.text}</p>
      <p className="mt-1 text-[13px] text-ink-2">{CHECK_TYPE_LABEL[r.checkType]}</p>

      <div className="mt-3 rounded-chip border border-border p-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <SourceChip source={r.source} />
          <span className="text-[12px] text-ink-2">
            {file?.name ?? 'Rulebook'}, {sourceWhere(r.source)}
          </span>
        </div>
        <p className="mt-1.5 flex items-start gap-1 text-[13px] italic text-ink-2">
          <Quote size={12} aria-hidden="true" className="mt-1 shrink-0" />
          <span className="break-words">{r.source.quote}</span>
        </p>
        {verified ? (
          <p className="mt-1.5 flex items-center gap-1 text-[12px] font-medium text-ok">
            <CircleCheck size={13} aria-hidden="true" />
            Quote checked by code
          </p>
        ) : (
          <p className="mt-1.5 flex items-start gap-1 text-[12px] font-medium text-warn">
            <TriangleAlert size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
            Quote not found in the rulebook — not applied
          </p>
        )}
      </div>

      <div className="mt-3">
        <h4 className="text-[12px] font-semibold text-ink-2">Findings it produced</h4>
        <div className="mt-1">
          <FindingLinks
            ids={r.findingIds}
            findings={project.findings}
            none={proposed ? 'None: a proposed rule is not applied.' : verified ? 'None: nothing was flagged by this rule.' : 'None: an unverified rule is not applied.'}
          />
        </div>
      </div>
    </article>
  )
}

/** Drop zone and buttons to add, replace or remove the rulebook. Disabled on the bundled sample data. */
function RulebookUpload() {
  const { project, source, applyProject } = useProject()
  const live = source === 'api'
  const [busy, setBusy] = useState<'adding' | 'removing' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const last = useRef<File | null>(null)
  const inputId = useId()
  const rulebook = project.rulebook

  const send = async (file: File) => {
    last.current = file
    setError(null)
    setDone(null)
    if (!isRulebookFile(file.name)) {
      setError(`${file.name} cannot be used as a rulebook. Use a DOCX, PDF, TXT or MD file.`)
      return
    }
    setBusy('adding')
    try {
      const updated = await api.uploadRulebook(file)
      applyProject(updated)
      last.current = null
      setDone(updated.rulebook ? `Rulebook added: ${updated.rulebook.name}, ${updated.rulebook.rules.length} rules read.` : 'The rulebook was sent, but no rules came back.')
    } catch (e) {
      setError(`The rulebook was not added: ${e instanceof Error ? e.message : 'something went wrong.'}`)
    }
    setBusy(null)
  }

  const remove = async () => {
    setError(null)
    setDone(null)
    setBusy('removing')
    try {
      applyProject(await api.removeRulebook())
      setDone('Rulebook removed. The checks use the market rules only.')
    } catch (e) {
      setError(`The rulebook was not removed: ${e instanceof Error ? e.message : 'something went wrong.'}`)
    }
    setBusy(null)
  }

  const disabled = !live || busy !== null
  const receive = (files: File[]) => {
    if (disabled || files.length === 0) return
    void send(files[0])
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    receive([...e.dataTransfer.files])
  }

  return (
    <div className="mt-3" data-rulebook-upload>
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center gap-1.5 rounded-card border-2 border-dashed px-6 py-8 text-center focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-info ${
          disabled ? 'cursor-not-allowed border-border bg-bg text-ink-2' : dragging ? 'cursor-pointer border-accent bg-accent/10' : 'cursor-pointer border-border bg-surface hover:border-ink-2'
        }`}
      >
        <Upload size={22} aria-hidden="true" className="text-ink-2" />
        <span className="text-[15px] font-semibold">{rulebook ? 'Replace the rulebook' : 'Add a rulebook'}</span>
        <span className="text-[13px] text-ink-2">DOCX, PDF, TXT or MD · drop it here or click to choose</span>
        <input
          id={inputId}
          type="file"
          aria-label="Rulebook file"
          accept={RULEBOOK_ACCEPT_ATTR}
          disabled={disabled}
          className="sr-only"
          onChange={(e) => {
            receive([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
      </label>

      {!live && (
        <p role="note" className="mt-2 flex items-start gap-1.5 text-[13px] text-ink-2">
          <CircleAlert size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
          Upload needs the backend. This page is showing the sample data, so a rulebook cannot be added or removed here.
        </p>
      )}

      {rulebook && (
        <div className="mt-2">
          <button type="button" onClick={() => void remove()} disabled={disabled} className={btn}>
            <Trash2 size={14} aria-hidden="true" />
            Remove rulebook
          </button>
        </div>
      )}

      {busy && (
        <div role="status" aria-label={busy === 'adding' ? 'Reading the rulebook' : 'Removing the rulebook'} className="mt-3 rounded-card border border-border bg-surface p-4">
          <p className="flex items-center gap-2 text-[14px] font-medium text-info">
            <LoaderCircle size={16} aria-hidden="true" className="motion-safe:animate-spin" />
            {busy === 'adding' ? 'Reading the rulebook and checking every quote. This can take a minute.' : 'Removing the rulebook and checking again.'}
          </p>
          <div className="mt-3 space-y-2" aria-hidden="true">
            <Skeleton className="w-2/3" />
            <Skeleton className="w-1/2" />
          </div>
        </div>
      )}
      {error && (
        <div role="alert" className="mt-3 flex items-start gap-2 rounded-card border border-bad/30 bg-bad/10 p-3 text-[14px]">
          <CircleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-bad" />
          <div className="min-w-0 flex-1">
            <p>{error}</p>
            {last.current && !busy && live && isRulebookFile(last.current.name) && (
              <button type="button" onClick={() => void send(last.current!)} className={`${btn} mt-2`}>
                <RotateCcw size={14} aria-hidden="true" />
                Retry
              </button>
            )}
          </div>
        </div>
      )}
      {done && !busy && !error && (
        <p role="status" className="mt-3 flex items-center gap-1.5 text-[14px] font-medium text-ok">
          <CircleCheck size={16} aria-hidden="true" />
          {done}
        </p>
      )}
    </div>
  )
}

/** The rules the artwork is checked against: the market rules in use, and the uploaded rulebook with each rule's quote. */
export function Rules() {
  const { project, source, load, reload } = useProject()
  if (source === 'api' && load.status === 'loading') return <LoadingSkeleton label="Loading rules" />
  if (source === 'api' && load.status === 'error') return <LoadError reason={load.reason} onRetry={() => void reload()} />

  const rulebook = project.rulebook
  const counts = rulebook
    ? {
        verified: rulebook.rules.filter((r) => r.status !== 'proposed' && r.source.quoteChecked).length,
        unverified: rulebook.rules.filter((r) => r.status !== 'proposed' && !r.source.quoteChecked).length,
        proposed: rulebook.rules.filter((r) => r.status === 'proposed').length,
      }
    : null

  return (
    <div className="mx-auto max-w-[960px]">
      <h1 className="text-[20px] font-semibold">Rules</h1>
      <p className="text-[14px] text-ink-2">What the artwork is checked against: the market rules, and a rulebook if you add one. Nothing here is applied without a quote that code found in the file.</p>

      <section aria-labelledby="market-rules-title" className="mt-6">
        <h2 id="market-rules-title" className="text-[16px] font-semibold">
          Market rules in use <span className="font-mono">{project.rules.length}</span>
        </h2>
        {project.rules.length === 0 ? (
          <p className="mt-2 flex items-center gap-1.5 text-[14px] text-ink-2">
            <BookCheck size={15} aria-hidden="true" />
            No market rules loaded yet. They appear once the files are checked.
          </p>
        ) : (
          <ul className="mt-2 space-y-3">
            {project.rules.map((r) => (
              <MarketRuleRow key={r.id} rule={r} findings={project.findings} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="rulebook-title" className="mt-8">
        <h2 id="rulebook-title" className="text-[16px] font-semibold">
          Rulebook
        </h2>
        {rulebook ? (
          <p className="text-[14px] text-ink-2">
            <span className="font-medium text-ink">{rulebook.name}</span> · <span className="font-mono">{rulebook.rules.length}</span> rules read
            {counts && (
              <>
                {' '}
                · <span className="font-mono">{counts.verified}</span> verified · <span className="font-mono">{counts.unverified}</span> unverified ·{' '}
                <span className="font-mono">{counts.proposed}</span> proposed
              </>
            )}
          </p>
        ) : (
          <p className="text-[14px] text-ink-2">A company or regulator rulebook adds its own rules to the checks.</p>
        )}
        <RulebookUpload />

        {rulebook ? (
          rulebook.rules.length === 0 ? (
            <p className="mt-4 flex items-center gap-1.5 text-[14px] text-ink-2">
              <BookCheck size={15} aria-hidden="true" />
              No rules could be read from {rulebook.name}.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {rulebook.rules.map((r) => (
                <li key={r.id}>
                  <RulebookRuleCard rule={r} project={project} />
                </li>
              ))}
            </ul>
          )
        ) : (
          <section className="mt-4 rounded-card border border-border bg-surface p-6 text-center">
            <BookCheck size={22} aria-hidden="true" className="mx-auto text-ink-2" />
            <h3 className="mt-2 text-[16px] font-semibold">No rulebook yet</h3>
            <p className="mt-1 text-ink-2">No rulebook yet — the checks use the market rules only.</p>
          </section>
        )}
      </section>
    </div>
  )
}
