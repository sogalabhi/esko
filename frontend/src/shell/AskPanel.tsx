import { BadgeCheck, CircleAlert, CircleOff, RotateCcw, Search, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { api, type FindingAskResult } from '../api/client'
import { RuleChip } from '../components/RuleChip'
import { SourceChip } from '../components/SourceChip'
import { Skeleton } from '../components/LoadGate'
import { mockAsk, mockAskFinding } from '../lib/askMock'
import { resolveRule } from '../lib/checks'
import { KIND_LABELS } from '../lib/findingKinds'
import { useProject } from '../state/project'
import { VerdictBadge } from '../components/VerdictBadge'

type Phase = 'idle' | 'asking' | 'confirming'

const btn =
  'inline-flex items-center gap-1.5 rounded-chip border border-border bg-surface px-3 py-1.5 text-[13px] font-medium hover:border-ink-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-info disabled:cursor-not-allowed disabled:opacity-60'

/**
 * "Ask about this": a side panel, closed by default. One question box and one answer at a time (not a chat thread).
 * Answers come from facts only, with source chips; "Confirm as fact" records the answer as a user-sourced fact.
 */
export function AskPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { project, source, applyProject, ask, openAsk } = useProject()
  const finding = ask.findingId ? (project.findings.find((f) => f.id === ask.findingId) ?? null) : null
  const findingId = finding?.id ?? null
  const [question, setQuestion] = useState('')
  const [asked, setAsked] = useState('')
  const [result, setResult] = useState<FindingAskResult | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const id = useId()
  const input = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) input.current?.focus()
  }, [open, findingId])

  // A different finding (or none) is a different conversation: start clean.
  useEffect(() => {
    setQuestion('')
    setAsked('')
    setResult(null)
    setError(null)
    setConfirmed(false)
    setPhase('idle')
  }, [findingId])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const run = async (q: string) => {
    setPhase('asking')
    setError(null)
    setResult(null)
    setConfirmed(false)
    setAsked(q)
    try {
      const r = source === 'api' ? await api.ask(q, findingId ?? undefined) : finding ? mockAskFinding(q, finding, project) : mockAsk(q, project.facts)
      if (r) setResult(r)
      else setError('This backend cannot answer questions yet.')
    } catch (e) {
      setError(`The question could not be answered: ${e instanceof Error ? e.message : 'something went wrong.'}`)
    }
    setPhase('idle')
  }

  const submit = () => {
    const q = question.trim()
    if (q && phase === 'idle') void run(q)
  }

  const confirm = async () => {
    if (!result || result.refused || finding) return
    setPhase('confirming')
    setError(null)
    try {
      if (source === 'api') {
        const updated = await api.confirmAsk(asked, result.answer, result.factIds)
        if (!updated) {
          setError('This backend cannot save answers as facts yet.')
          setPhase('idle')
          return
        }
        applyProject(updated)
      }
      setConfirmed(true)
    } catch (e) {
      setError(`The answer was not saved as a fact: ${e instanceof Error ? e.message : 'something went wrong.'}`)
    }
    setPhase('idle')
  }

  const facts = result ? result.factIds.map((fid) => project.facts.find((f) => f.id === fid)).filter((f) => !!f) : []
  const rules = (result?.ruleIds ?? []).map((id) => ({ id, ...resolveRule(id, project) }))
  // `evidence` holds positions in the finding's own evidence list.
  const quotes = finding
    ? (result?.evidence ?? []).flatMap((i) => {
        const src = finding.evidence[i]
        return src ? [{ index: i, source: src }] : []
      })
    : []
  const cited = facts.length + rules.length + quotes.length

  return (
    <aside
      aria-label="Ask about this"
      className="no-print fixed bottom-0 right-0 top-14 z-30 flex w-full flex-col border-l border-border bg-surface shadow-[-8px_0_24px_rgba(22,24,29,0.08)] sm:w-[400px]"
    >
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-[16px] font-semibold">Ask about this</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Ask about this"
          className="rounded-chip p-1 text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-info"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {finding && (
          <section aria-label="Finding in question" data-ask-finding={finding.id} className="rounded-card border border-border bg-bg p-3 text-[13px]">
            <p className="text-[12px] text-ink-2">Asking about this finding</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <VerdictBadge verdict={finding.verdict} decision={finding.decision} />
              <span className="text-[12px] text-ink-2">{KIND_LABELS[finding.kind]}</span>
            </div>
            <p className="mt-1 text-[14px] font-medium">{finding.title}</p>
            <button type="button" onClick={() => openAsk()} className="mt-2 text-[12px] font-medium text-info hover:underline focus-visible:outline-2 focus-visible:outline-info">
              Ask something general instead
            </button>
          </section>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <label htmlFor={`${id}-q`} className="text-[13px] font-medium">
            Your question
          </label>
          <p className="text-[12px] text-ink-2">
            {finding ? 'Answers use only this finding: its rules, facts and evidence quotes.' : 'Answers use only the facts, each with its source.'}
          </p>
          <textarea
            id={`${id}-q`}
            ref={input}
            rows={3}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            className="mt-1 w-full rounded-chip border border-border bg-surface p-2 text-[14px] focus-visible:outline-2 focus-visible:outline-info"
          />
          <button type="submit" disabled={!question.trim() || phase !== 'idle'} className={`${btn} mt-2`}>
            <Search size={14} aria-hidden="true" />
            Ask
          </button>
        </form>

        {phase === 'asking' && (
          <div role="status" aria-label="Looking up the facts" className="space-y-2">
            <span className="sr-only">Looking up the facts…</span>
            <Skeleton className="w-2/3" />
            <Skeleton className="w-full" />
            <Skeleton className="w-1/2" />
          </div>
        )}

        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-card border border-bad/30 bg-bad/10 p-3 text-[14px]">
            <CircleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-bad" />
            <div className="min-w-0 flex-1">
              <p>{error}</p>
              {asked && phase === 'idle' && !result && (
                <button type="button" onClick={() => void run(asked)} className={`${btn} mt-2`}>
                  <RotateCcw size={14} aria-hidden="true" />
                  Retry
                </button>
              )}
            </div>
          </div>
        )}

        {result?.refused && (
          <section aria-label="Answer" data-refused className="rounded-card border border-warn/40 bg-warn/10 p-3 text-[14px]">
            <p className="flex items-center gap-1.5 font-semibold text-warn">
              <CircleOff size={16} aria-hidden="true" />
              Not answered
            </p>
            <p className="mt-1 text-[12px] text-ink-2">Reason</p>
            <p>{result.answer}</p>
          </section>
        )}

        {result && !result.refused && (
          <section aria-label="Answer" className="rounded-card border border-border p-3 text-[14px]">
            <p className="text-[12px] text-ink-2">
              You asked: <span className="text-ink">{asked}</span>
            </p>
            <p className="mt-2 text-[15px]">{result.answer}</p>
            <div className="mt-3 space-y-1.5" data-citations>
              <h3 className="text-[12px] font-semibold uppercase text-ink-2">{finding ? 'Cites' : 'Sources'}</h3>
              {cited === 0 && <p className="text-[12px] text-ink-2">{finding ? 'Nothing cited.' : 'No source file.'}</p>}
              {rules.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5" aria-label="Rules cited">
                  {rules.map((r) => (
                    <RuleChip key={r.id} rule={r.rule} title={r.title} statusText={r.statusText} warning={r.warning} />
                  ))}
                </div>
              )}
              {quotes.map((q) => (
                <div key={q.index} className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[12px] text-ink-2">Evidence {q.index + 1}</span>
                  <SourceChip source={q.source} />
                </div>
              ))}
              {facts.map((f) => (
                <div key={f.id} className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[12px] text-ink-2">{f.field}</span>
                  {f.sources.length === 0 ? (
                    <span className="text-[12px] text-ink-2">Answered by a person</span>
                  ) : (
                    f.sources.slice(0, 2).map((s, i) => <SourceChip key={i} source={s} />)
                  )}
                </div>
              ))}
            </div>
            {!finding && (
            <div className="mt-3">
              {confirmed ? (
                <p role="status" className="flex items-center gap-1.5 text-[13px] font-semibold text-ok">
                  <BadgeCheck size={16} aria-hidden="true" />
                  Confirmed as a fact
                </p>
              ) : (
                <button type="button" onClick={() => void confirm()} disabled={phase !== 'idle'} className={btn}>
                  <BadgeCheck size={14} aria-hidden="true" />
                  {phase === 'confirming' ? 'Saving…' : 'Confirm as fact'}
                </button>
              )}
            </div>
            )}
          </section>
        )}
      </div>
    </aside>
  )
}
