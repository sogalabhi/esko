import { ArrowRight, CircleAlert, CircleCheck, CircleDashed, Minus, Play, Plus, RotateCcw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { collapse, diffWords, numberDeltas } from '../lib/wordDiff'
import type { ChangeReport, FindingMove, HistoryEntry, PieceChange, TokenSaving } from '../types/project'
import { VerdictBadge } from './VerdictBadge'

export const fmtDate = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
const n = (v: number) => v.toLocaleString('en-GB')
const signed = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : '±0')

/** The words that changed, struck out and underlined like track changes; unchanged text in between is folded away. */
export function WordDiff({ before, after }: { before: string; after: string }) {
  const [full, setFull] = useState(false)
  const ops = useMemo(() => diffWords(before, after), [before, after])
  const shown = useMemo(() => (full ? ops : collapse(ops)), [ops, full])
  const folded = shown.some((o) => o.kind === 'gap')
  return (
    <div className="text-[13px] leading-relaxed">
      <p>
        {shown.map((o, i) =>
          o.kind === 'ins' && shown[i - 1]?.kind === 'del' ? (
            <span key={i}>
              {' '}
              <ins className="rounded bg-info/10 text-info underline decoration-info/70 underline-offset-2">
                <span className="sr-only">inserted: </span>
                {o.text}
              </ins>
            </span>
          ) : o.kind === 'del' ? (
            <del key={i} className="rounded bg-bad/10 text-bad decoration-bad/70">
              <span className="sr-only">deleted: </span>
              {o.text}
            </del>
          ) : o.kind === 'ins' ? (
            <ins key={i} className="rounded bg-info/10 text-info underline decoration-info/70 underline-offset-2">
              <span className="sr-only">inserted: </span>
              {o.text}
            </ins>
          ) : o.kind === 'gap' ? (
            <span key={i} className="text-ink-2" aria-label="unchanged text">
              …
            </span>
          ) : (
            <span key={i}>{o.text}</span>
          ),
        )}
      </p>
      {(folded || full) && (
        <button type="button" onClick={() => setFull(!full)} className="mt-1 text-[12px] font-medium text-info underline focus-visible:outline-2 focus-visible:outline-info">
          {full ? 'Show only the changes' : 'Show full text'}
        </button>
      )}
    </div>
  )
}

const KIND = {
  changed: { word: 'Changed', Icon: ArrowRight, cls: 'bg-info/10 text-info' },
  added: { word: 'Added', Icon: Plus, cls: 'bg-ok/10 text-ok' },
  removed: { word: 'Removed', Icon: Minus, cls: 'bg-bad/10 text-bad' },
} as const

/** One piece of text that changed in the file: where it is, the numbers that moved, then the words. */
export function PieceChangeRow({ c }: { c: PieceChange }) {
  const k = KIND[c.kind]
  const deltas = c.old && c.new ? numberDeltas(c.old, c.new) : []
  return (
    <li data-piece-change className="rounded-card border border-border bg-surface p-3">
      <p className="flex flex-wrap items-center gap-2 text-[12px] text-ink-2">
        <span className={`inline-flex items-center gap-1 rounded-chip px-2 py-0.5 font-medium ${k.cls}`}>
          <k.Icon size={13} aria-hidden="true" />
          {k.word}
        </span>
        <span className="font-mono">{c.where}</span>
        {c.label && <span>· {c.label}</span>}
      </p>
      {deltas.length > 0 && (
        <ul aria-label="Numbers that changed" className="mt-2 flex flex-wrap gap-2">
          {deltas.map((d, i) => (
            <li key={i} className="inline-flex items-center gap-1.5 rounded-chip border border-warn/40 bg-warn/10 px-2.5 py-1 text-[13px]">
              <span className="sr-only">
                {d.label ? `${d.label}: ` : ''}
                {d.before} changed to {d.after}
              </span>
              <span aria-hidden="true" className="flex items-center gap-1.5">
                {d.label && <span className="text-ink-2">{d.label}</span>}
                <s className="font-mono text-bad">{d.before}</s>
                <ArrowRight size={13} />
                <b className="font-mono text-ok">{d.after}</b>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2">
        {c.old && c.new ? (
          deltas.length > 0 && c.old.length < 30 ? null : <WordDiff before={c.old} after={c.new} />
        ) : (
          <p className="text-[13px]">{c.new ?? c.old}</p>
        )}
      </div>
    </li>
  )
}

/** The whole update in one line: what was fixed, what is new, and what needs a person, with the verdict counts. */
export function ImpactHero({ change, was }: { change: ChangeReport; was?: HistoryEntry['counts'] }) {
  const f = change.findings
  if (!f) return null
  const reopened = change.reopened.length
  const worse = f.new.length > 0 || reopened > 0
  const now = change.counts
  const delta = (key: 'fail' | 'review' | 'pass', label: string) =>
    now && was ? (
      <span key={key}>
        {label} <span className="font-mono">{was[key] ?? 0}</span> → <span className="font-mono font-semibold">{now[key]}</span>{' '}
        <span className="font-mono text-ink-2">({signed(now[key] - (was[key] ?? 0))})</span>
      </span>
    ) : null
  return (
    <section
      aria-label="What the update did to the checks"
      data-testid="change-summary"
      className={`rounded-card border p-4 ${worse ? 'border-warn/40 bg-warn/10' : 'border-ok/40 bg-ok/10'}`}
    >
      <p aria-live="polite" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] font-semibold">
        <span className="inline-flex items-center gap-1.5">
          <CircleCheck size={18} aria-hidden="true" className="text-ok" />
          <span className="font-mono">{f.resolved.length}</span> fixed
        </span>
        <span>·</span>
        <span>
          <span className="font-mono">{f.new.length}</span> new
        </span>
        <span>·</span>
        <span>
          <span className="font-mono">{change.decisionsKept ?? 0}</span> {change.decisionsKept === 1 ? 'decision' : 'decisions'} kept
        </span>
        {reopened > 0 && (
          <>
            <span>·</span>
            <span className="inline-flex items-center gap-1.5 text-warn">
              <CircleAlert size={18} aria-hidden="true" />
              <span className="font-mono">{reopened}</span> to decide again
            </span>
          </>
        )}
      </p>
      {now && was && <p className="mt-1.5 flex flex-wrap gap-x-4 text-[13px]">{[delta('fail', 'Fail'), delta('review', 'Needs review'), delta('pass', 'Pass')]}</p>}
    </section>
  )
}

const FIXED_WORD: Record<string, string> = { fail: 'Fixed', review: 'No longer needs review', pass: 'No longer checked' }

function MoveRow({ m, kind }: { m: FindingMove; kind: 'fixed' | 'new' | 'changed' }) {
  return (
    <li className="text-[13px]">
      <p className="flex flex-wrap items-center gap-1.5">
        {kind === 'fixed' ? (
          <span className="inline-flex items-center gap-1 rounded-chip bg-ok/10 px-2 py-0.5 text-[12px] font-medium text-ok">
            <CircleCheck size={14} aria-hidden="true" />
            {FIXED_WORD[m.wasVerdict ?? 'fail']}
          </span>
        ) : kind === 'new' ? (
          <>
            <VerdictBadge verdict={m.verdict} />
            <span className="text-[12px] font-medium text-ink-2">New</span>
          </>
        ) : (
          <span aria-label={`Was ${m.wasVerdict ?? m.verdict}, now ${m.verdict}`} className="inline-flex items-center gap-1">
            {m.wasVerdict && <VerdictBadge verdict={m.wasVerdict} />}
            <ArrowRight size={13} aria-hidden="true" className="text-ink-2" />
            <VerdictBadge verdict={m.verdict} />
          </span>
        )}
      </p>
      <p className="mt-1">
        {kind === 'fixed' ? (
          m.title
        ) : (
          <Link to={`/checks?finding=${encodeURIComponent(m.id)}`} className="text-info underline focus-visible:outline-2 focus-visible:outline-info">
            {m.title}
          </Link>
        )}
      </p>
      {kind === 'changed' && m.was && m.now && (
        <p className="mt-0.5 font-mono text-[12px] text-ink-2">
          {m.was} → {m.now}
        </p>
      )}
    </li>
  )
}

/** Fixed, new and changed findings side by side. */
export function FindingMoves({ change }: { change: ChangeReport }) {
  const f = change.findings
  if (!f) return null
  const cols = [
    { id: 'fixed', title: 'Fixed', moves: f.resolved, empty: 'Nothing was fixed.' },
    { id: 'new', title: 'New', moves: f.new, empty: 'Nothing new failed.' },
    { id: 'changed', title: 'Changed', moves: f.changed, empty: 'No finding changed.' },
  ] as const
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {cols.map((c) => (
        <section key={c.id} aria-label={c.title} className="rounded-card border border-border bg-surface p-3">
          <h4 className="text-[13px] font-semibold">
            {c.title} <span className="font-mono text-ink-2">{c.moves.length}</span>
          </h4>
          {c.moves.length === 0 ? (
            <p className="mt-1 text-[13px] text-ink-2">{c.empty}</p>
          ) : (
            <ul className="mt-2 space-y-3">
              {c.moves.map((m) => (
                <MoveRow key={m.id} m={m} kind={c.id} />
              ))}
            </ul>
          )}
        </section>
      ))}
      {f.unchanged > 0 && <p className="text-[12px] text-ink-2 md:col-span-3">{f.unchanged} other findings did not change.</p>}
    </div>
  )
}

/** Earlier decisions: the ones that still apply, and the ones handed back to a person. Nothing is resolved silently. */
export function DecisionsCarried({ change }: { change: ChangeReport }) {
  if (change.decisionsKept == null) return null
  return (
    <section aria-label="Earlier decisions" className="rounded-card border border-border bg-surface p-3 text-[13px]">
      <h4 className="font-semibold">Your earlier decisions</h4>
      <p className="mt-1 flex items-center gap-1.5">
        <CircleCheck size={15} aria-hidden="true" className="text-ok" />
        <span className="font-mono">{change.decisionsKept}</span> kept: they still apply, because the finding did not change.
      </p>
      {change.reopened.length === 0 ? (
        <p className="mt-1 text-ink-2">No decision needs to be made again.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {change.reopened.map((r) => (
            <li key={r.title} className="rounded border border-warn/40 bg-warn/10 p-2.5">
              <p className="flex items-center gap-1.5 font-medium text-warn">
                <CircleAlert size={15} aria-hidden="true" />1 to decide again
              </p>
              <p className="mt-1">{r.title}</p>
              <p className="mt-0.5 text-ink-2">
                Was: {r.was}
                {r.note ? `, “${r.note}”` : ''}. The finding changed, so the old answer is shown only as history.
              </p>
              {r.findingId && (
                <Link
                  to={`/checks?finding=${encodeURIComponent(r.findingId)}`}
                  className="mt-2 inline-flex items-center gap-1 rounded-chip bg-accent px-3 py-1 text-[12px] font-semibold text-white hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info"
                >
                  Decide again
                  <ArrowRight size={13} aria-hidden="true" />
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** What the AI was sent, against reading everything again. */
export function TokenLine({ tokens }: { tokens?: TokenSaving | null }) {
  if (!tokens) return null
  const share = tokens.fullTokens ? Math.max(2, Math.round((100 * tokens.sentTokens) / tokens.fullTokens)) : 0
  return (
    <section aria-label="What the AI read" className="rounded-card border border-border bg-surface p-3 text-[13px]" data-testid="token-saving">
      <h4 className="font-semibold">Only what changed was read again</h4>
      <ul className="mt-1 space-y-0.5 text-ink-2">
        {tokens.files.map((f) => (
          <li key={f.file}>
            <span className="font-mono text-ink">
              {f.changed} of {f.total}
            </span>{' '}
            {f.unit} read again · {f.file}
          </li>
        ))}
      </ul>
      <div className="mt-2" role="img" aria-label={`About ${n(tokens.sentTokens)} tokens sent instead of ${n(tokens.fullTokens)}, ${tokens.savedPercent} percent fewer`}>
        <div className="h-2 rounded bg-bg" aria-hidden="true">
          <div className="h-2 rounded bg-ok" style={{ width: `${share}%` }} />
        </div>
        <p className="mt-1">
          About <span className="font-mono font-semibold">{n(tokens.sentTokens)}</span> tokens sent instead of{' '}
          <span className="font-mono">{n(tokens.fullTokens)}</span> ·{' '}
          <span className="font-semibold text-ok">{tokens.savedPercent}% fewer</span>
          {tokens.imagesFull > tokens.imagesSent && (
            <>
              {' '}
              · <span className="font-mono">{tokens.imagesFull - tokens.imagesSent}</span> panel pictures not sent
            </>
          )}
        </p>
        <p className="text-[12px] text-ink-2">
          {tokens.reusedFacts} facts kept from the earlier read, quotes checked again by code; {tokens.rereadFacts} read again. Estimate: characters ÷ 4.
        </p>
      </div>
    </section>
  )
}

/** Before the checks are run again: what will be read again, and the button. */
export function CheckAgainPanel({ change, running, onCheckAgain }: { change: ChangeReport; running: boolean; onCheckAgain: () => void }) {
  const p = change.pieces
  return (
    <section aria-label="Check again" className="rounded-card border border-info/40 bg-info/10 p-4 text-[14px]">
      <h3 className="font-semibold">Check again</h3>
      <p className="mt-1">
        <span className="font-mono">{p.changed + p.added + p.removed}</span> text {p.changed + p.added + p.removed === 1 ? 'change' : 'changes'} in {change.fileName}. The files that did not change are read from the earlier results; only what changed is sent to the AI.
      </p>
      <p className="mt-1 text-[13px] text-ink-2">Your decisions are kept and checked against the new results. Anything that changed comes back to you.</p>
      <button
        type="button"
        onClick={onCheckAgain}
        disabled={running}
        className="mt-3 inline-flex items-center gap-1.5 rounded-chip bg-accent px-4 py-2 text-[14px] font-semibold text-white hover:bg-accent/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info"
      >
        {running ? <RotateCcw size={16} aria-hidden="true" className="motion-safe:animate-spin" /> : <Play size={16} aria-hidden="true" />}
        {running ? 'Checking…' : 'Check again'}
      </button>
    </section>
  )
}

/** v1 → v2 → v3: who, when, and how the verdicts moved at each step. */
export function VersionTimeline({ history }: { history: HistoryEntry[] }) {
  if (history.length === 0) return null
  return (
    <ol aria-label="Versions" className="flex gap-3 overflow-x-auto pb-1">
      {history.map((h, i) => {
        const prev = history[i - 1]?.counts
        const d = (key: 'fail' | 'review' | 'pass') => (h.counts && prev ? (h.counts[key] ?? 0) - (prev[key] ?? 0) : null)
        return (
          <li key={`${h.version}-${i}`} className="min-w-[200px] flex-1 rounded-card border border-border bg-surface p-3">
            <p className="flex items-center gap-2">
              <span className="rounded-chip bg-accent px-2 py-0.5 font-mono text-[12px] font-semibold text-white">{h.version}</span>
              <span className="text-[12px] text-ink-2">{fmtDate(h.at)}</span>
            </p>
            <p className="mt-1.5 text-[13px] font-semibold">{h.title}</p>
            <p className="text-[12px] text-ink-2">
              {h.by} · {h.role}
            </p>
            {h.counts && (
              <p className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[12px]">
                {(['fail', 'review', 'pass'] as const).map((k) => (
                  <span key={k}>
                    {k === 'fail' ? 'Fail' : k === 'review' ? 'Review' : 'Pass'} {h.counts?.[k] ?? 0}
                    {d(k) ? <span className={k === 'pass' ? 'text-ok' : d(k)! < 0 ? 'text-ok' : 'text-bad'}> {signed(d(k)!)}</span> : null}
                  </span>
                ))}
              </p>
            )}
          </li>
        )
      })}
    </ol>
  )
}

export { CircleDashed }
