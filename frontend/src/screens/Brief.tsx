import {
  BadgeCheck,
  CircleAlert,
  Download,
  FilePlus2,
  FileText,
  Link2,
  Printer,
  RotateCcw,
  Save,
  TriangleAlert,
  X,
} from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { api } from '../api/client'
import { Skeleton } from '../components/LoadGate'
import { SourceDots } from '../components/SourceDots'
import { formatValue, sourceLong } from '../lib/labels'
import { ago, stamp } from '../lib/time'
import { useProject } from '../state/project'
import type { BriefSentence, SentenceSource } from '../types/project'

const NAME_KEY = 'bf.approver'
const NOT_IN_FACTS = 'Not in facts — add a source or mark as assumption'

const btn =
  'inline-flex items-center gap-1.5 rounded-chip border border-border bg-surface px-3 py-1.5 text-[13px] font-medium hover:border-ink-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-info disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border'

const SOURCE_WORD: Record<SentenceSource, { short: string; long: string }> = {
  code: { short: 'code', long: 'Written by code' },
  ai: { short: 'AI', long: 'Written by AI, then audited' },
  user: { short: 'you', long: 'Written or edited by you' },
}

function readName(): string {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}
function saveName(name: string) {
  try {
    window.localStorage.setItem(NAME_KEY, name)
  } catch {
    /* storage unavailable: the name is kept for this visit only */
  }
}

function SentenceRow({ section, index, sentence, refs }: { section: string; index: number; sentence: BriefSentence; refs: Map<string, number> }) {
  const { editSentence, briefBusy } = useProject()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(sentence.text)
  const tipId = useId()
  const area = useRef<HTMLTextAreaElement>(null)
  const unproven = sentence.status !== 'ok'

  useEffect(() => {
    if (editing) area.current?.focus()
  }, [editing])

  const open = () => {
    setDraft(sentence.text)
    setEditing(true)
  }
  const save = async () => {
    const text = draft.trim()
    if (!text || text === sentence.text) {
      setEditing(false)
      return
    }
    if (await editSentence(section, index, text)) setEditing(false)
  }

  if (editing) {
    return (
      <li data-sentence={`${section}:${index}`} className="py-1">
        <label htmlFor={`${tipId}-edit`} className="sr-only">
          Edit sentence {index + 1} of {section}
        </label>
        <textarea
          id={`${tipId}-edit`}
          ref={area}
          value={draft}
          rows={3}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditing(false)
            else if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void save()
            }
          }}
          className="w-full rounded-chip border border-info bg-surface p-2 text-[15px] leading-6 focus-visible:outline-2 focus-visible:outline-info"
        />
        <div className="mt-1 flex items-center gap-2">
          <button type="button" onClick={() => void save()} disabled={briefBusy === 'saving'} className={btn}>
            <Save size={14} aria-hidden="true" />
            {briefBusy === 'saving' ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={() => setEditing(false)} className={btn}>
            <X size={14} aria-hidden="true" />
            Cancel
          </button>
          <span className="text-[12px] text-ink-2">Enter saves, Shift+Enter adds a line, Esc cancels.</span>
        </div>
      </li>
    )
  }

  return (
    <li data-sentence={`${section}:${index}`} data-status={sentence.status} className="py-1 text-[15px] leading-6">
      <span className="group relative">
        <button
          type="button"
          onClick={open}
          title="Click to edit"
          aria-describedby={unproven ? tipId : undefined}
          className={`rounded-[4px] text-left hover:bg-bg focus-visible:outline-2 focus-visible:outline-info ${
            unproven ? 'underline decoration-ai decoration-dotted decoration-2 underline-offset-4' : ''
          }`}
        >
          {sentence.text}
        </button>
        {unproven && (
          <span
            role="tooltip"
            id={tipId}
            className="no-print pointer-events-none absolute left-0 top-full z-10 mt-1 hidden w-72 rounded-card border border-ai/40 bg-surface p-2 text-[12px] leading-4 shadow-sm group-focus-within:block group-hover:block"
          >
            <span className="block font-medium text-ai">{NOT_IN_FACTS}</span>
            {sentence.problems.length > 0 && (
              <ul className="mt-1 list-disc pl-4 text-ink">
                {sentence.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </span>
        )}
      </span>
      <SourceDots factIds={sentence.factIds} refs={refs} />
      {unproven && (
        <span className="no-print ml-1 inline-flex items-center gap-1 whitespace-nowrap rounded-chip bg-ai/10 px-1.5 py-0.5 align-baseline text-[12px] font-medium text-ai">
          <TriangleAlert size={12} aria-hidden="true" />
          Unproven
        </span>
      )}
      <span className="no-print ml-1.5 font-mono text-[10px] uppercase text-ink-2" title={SOURCE_WORD[sentence.source].long}>
        <span className="sr-only">{SOURCE_WORD[sentence.source].long}: </span>
        <span aria-hidden="true">{SOURCE_WORD[sentence.source].short}</span>
      </span>
    </li>
  )
}

function BriefSkeleton() {
  return (
    <div role="status" aria-label="Drafting the brief" className="space-y-4">
      <span className="sr-only">Drafting the brief…</span>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} aria-hidden="true" className="space-y-2 rounded-card border border-border bg-surface p-4">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="w-full" />
          <Skeleton className="w-4/5" />
        </div>
      ))}
    </div>
  )
}

export function Brief() {
  const { project, briefBusy, briefError, draftBrief, approveBrief, dismissBriefError } = useProject()
  const brief = project.brief
  const [name, setName] = useState(readName)
  const [note, setNote] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const nameId = useId()
  const reasonId = useId()

  const sentences = useMemo(() => brief.sections.flatMap((s) => s.sentences), [brief.sections])
  const unproven = sentences.filter((s) => s.status !== 'ok').length

  // Printed refs: facts numbered in order of first use, with a sources appendix.
  const refs = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of sentences) for (const id of s.factIds) if (!m.has(id)) m.set(id, m.size + 1)
    return m
  }, [sentences])

  const drafting = briefBusy === 'drafting'
  const editedAgo = ago(brief.log?.at(-1)?.at)
  const version = `Draft ${brief.version}${editedAgo ? ` · edited ${editedAgo}` : ''}`

  if (drafting) {
    return (
      <div className="mx-auto max-w-[800px]">
        <h1 className="text-[20px] font-semibold">Brief</h1>
        <div className="mt-4">
          <BriefSkeleton />
        </div>
      </div>
    )
  }

  if (brief.sections.length === 0) {
    return (
      <section aria-labelledby="brief-empty" className="mx-auto mt-16 max-w-md rounded-card border border-border bg-surface p-8 text-center">
        <FileText size={24} aria-hidden="true" className="mx-auto text-ink-2" />
        <h1 id="brief-empty" className="mt-3 text-[20px] font-semibold">
          Answer the open questions, then draft the brief
        </h1>
        <p className="mt-1 text-ink-2">Every sentence is written from the facts and answers, and checked before it appears.</p>
        {briefError && (
          <p role="alert" className="mt-4 flex items-start gap-2 rounded-card border border-bad/30 bg-bad/10 p-3 text-left text-[14px]">
            <CircleAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-bad" />
            {briefError.message}
          </p>
        )}
        <button
          type="button"
          onClick={() => void draftBrief()}
          className="mt-4 inline-flex items-center gap-1.5 rounded-chip bg-accent px-4 py-2 text-[14px] font-semibold text-white hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info"
        >
          {briefError ? <RotateCcw size={16} aria-hidden="true" /> : <FilePlus2 size={16} aria-hidden="true" />}
          {briefError ? 'Retry' : 'Draft the brief'}
        </button>
      </section>
    )
  }

  const approved = !!brief.approvedBy
  const trimmed = name.trim()
  const reason =
    unproven > 0
      ? `${unproven} sentence${unproven === 1 ? ' is' : 's are'} not in the facts. Add a source or fix ${unproven === 1 ? 'it' : 'them'} first.`
      : !trimmed
        ? 'Enter your name to approve.'
        : null
  const approveDisabled = reason !== null || briefBusy === 'approving'

  const approve = () => {
    saveName(trimmed)
    void approveBrief(trimmed)
  }

  const exportChecklist = async () => {
    setExportError(null)
    try {
      const text = await api.checklistJson()
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = 'briefforge-checklist.json'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setExportError(`The checklist could not be exported: ${e instanceof Error ? e.message : 'something went wrong.'}`)
    }
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setNote('Link copied')
    } catch {
      setNote('Could not copy. Copy the address from the browser bar.')
    }
  }

  const goTo = (i: number) => {
    const el = document.getElementById(`brief-section-${i}`)
    el?.scrollIntoView?.({ behavior: 'auto', block: 'start' })
    el?.focus()
  }

  return (
    <div className="mx-auto grid max-w-[1100px] gap-6 lg:grid-cols-[168px_minmax(0,800px)] xl:grid-cols-[200px_minmax(0,800px)]">
      <nav aria-label="Brief outline" className="no-print lg:sticky lg:top-20 lg:self-start">
        <h2 className="text-[12px] font-semibold uppercase text-ink-2">Outline</h2>
        <ol className="mt-2 space-y-0.5">
          {brief.sections.map((s, i) => {
            const n = s.sentences.filter((x) => x.status !== 'ok').length
            return (
              <li key={s.title}>
                <button
                  type="button"
                  onClick={() => goTo(i)}
                  className="flex w-full items-start justify-between gap-2 rounded-chip px-2 py-1.5 text-left text-[13px] hover:bg-surface focus-visible:outline-2 focus-visible:outline-info"
                >
                  <span className="min-w-0">
                    <span className="mr-1 font-mono text-ink-2">{i + 1}</span>
                    {s.title}
                  </span>
                  {n > 0 && (
                    <span className="inline-flex shrink-0 items-center gap-0.5 text-[12px] font-medium text-ai">
                      <TriangleAlert size={12} aria-hidden="true" />
                      <span className="font-mono">{n}</span>
                      <span className="sr-only"> unproven</span>
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-semibold">Brief</h1>
            <p data-testid="brief-version" className="mt-0.5 text-[13px] text-ink-2">
              {version}
            </p>
            {approved && (
              <p data-testid="approved-stamp" role="status" className="mt-1 inline-flex items-center gap-1.5 text-[14px] font-semibold text-ok">
                <BadgeCheck size={16} aria-hidden="true" />
                Approved by {brief.approvedBy}
                {brief.approvedAt ? ` · ${stamp(brief.approvedAt)}` : ''}
              </p>
            )}
          </div>

          <div className="no-print flex flex-wrap items-center justify-end gap-2" role="group" aria-label="Brief actions">
            {!approved && (
              <div className="flex items-center gap-2">
                <label htmlFor={nameId} className="text-[12px] text-ink-2">
                  Your name
                </label>
                <input
                  id={nameId}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-32 rounded-chip border border-border bg-surface px-2 py-1 text-[13px] focus-visible:outline-2 focus-visible:outline-info"
                />
                <button
                  type="button"
                  onClick={approve}
                  disabled={approveDisabled}
                  aria-describedby={reason ? reasonId : undefined}
                  className="inline-flex items-center gap-1.5 rounded-chip border border-accent bg-accent px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-info disabled:cursor-not-allowed disabled:border-border disabled:bg-border disabled:text-ink-2"
                >
                  <BadgeCheck size={14} aria-hidden="true" />
                  Approve
                </button>
              </div>
            )}
            <button type="button" className={btn} onClick={() => window.print()}>
              <Printer size={14} aria-hidden="true" />
              Export PDF
            </button>
            <button type="button" className={btn} onClick={() => void exportChecklist()}>
              <Download size={14} aria-hidden="true" />
              Export checklist (JSON)
            </button>
            <button type="button" className={btn} onClick={() => void copyLink()}>
              <Link2 size={14} aria-hidden="true" />
              Copy share link
            </button>
          </div>
        </div>

        <div className="no-print space-y-2" aria-live="polite">
          {reason && !approved && (
            <p id={reasonId} data-testid="approve-reason" className="flex items-start gap-1.5 rounded-card border border-ai/30 bg-ai/10 p-3 text-[14px]">
              <TriangleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-ai" />
              Approve is off. {reason}
            </p>
          )}
          {briefError && (
            <p role="alert" className="flex items-start gap-1.5 rounded-card border border-bad/30 bg-bad/10 p-3 text-[14px]">
              <CircleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-bad" />
              <span className="flex-1">{briefError.message}</span>
              <button type="button" onClick={dismissBriefError} className="font-medium underline focus-visible:outline-2 focus-visible:outline-info">
                Dismiss
              </button>
            </p>
          )}
          {exportError && (
            <p role="alert" className="flex items-start gap-1.5 rounded-card border border-bad/30 bg-bad/10 p-3 text-[14px]">
              <CircleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-bad" />
              {exportError}
            </p>
          )}
          {note && (
            <p role="status" className="text-[13px] text-ink-2">
              {note}
            </p>
          )}
        </div>

        <article aria-label="Design brief" className="brief-doc mt-2 rounded-card border border-border bg-surface p-8">
          {brief.sections.map((sec, si) => (
            <section key={sec.title} aria-labelledby={`brief-section-${si}`} className="brief-section mb-8 last:mb-0">
              <h2 id={`brief-section-${si}`} tabIndex={-1} className="mb-2 text-[16px] font-semibold focus-visible:outline-2 focus-visible:outline-info">
                {sec.title}
              </h2>
              {sec.sentences.length === 0 ? (
                <p className="text-[14px] text-ink-2">Nothing in this section yet.</p>
              ) : (
                <ol className="list-none space-y-0.5 p-0">
                  {sec.sentences.map((s, i) => (
                    <SentenceRow key={`${i}-${s.text}`} section={sec.title} index={i} sentence={s} refs={refs} />
                  ))}
                </ol>
              )}
            </section>
          ))}

          <section className="print-only brief-section" aria-label="Sources">
            <h2 className="mb-2 text-[16px] font-semibold">Sources</h2>
            <ol className="list-none space-y-1 p-0 text-[12px]">
              {[...refs.entries()].map(([id, n]) => {
                const fact = project.facts.find((f) => f.id === id)
                return (
                  <li key={id}>
                    <span className="font-mono">[{n}]</span> {fact ? `${fact.field}: ${formatValue(fact)}` : id}
                    {fact?.sources.map((src, i) => (
                      <span key={i} className="block pl-6 text-ink-2">
                        {sourceLong(src, project.files.find((f) => f.id === src.fileId))} · “{src.quote}”
                      </span>
                    ))}
                    {fact && fact.sources.length === 0 && <span className="block pl-6 text-ink-2">No source file (answered by a person)</span>}
                  </li>
                )
              })}
            </ol>
          </section>
        </article>

        {(brief.log?.length ?? 0) > 0 && (
          <details className="no-print mt-4 rounded-card border border-border bg-surface p-3 text-[13px]">
            <summary className="cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-info">
              Change log (<span className="font-mono">{brief.log!.length}</span>)
            </summary>
            <ul className="mt-2 space-y-1">
              {[...brief.log!].reverse().map((l, i) => (
                <li key={i}>
                  <span className="font-mono text-ink-2">{stamp(l.at)}</span> · <span className="font-medium">{l.who}</span> · {l.what}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  )
}
