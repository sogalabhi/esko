import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ClipboardCheck, CircleAlert, CircleCheck, CircleX, FileUp, Info, UserRound, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { FindingCard } from '../components/FindingCard'
import { ProofLine } from '../components/ProofLine'
import { SourceChips } from '../components/SourceChip'
import { VERDICT_LABEL, VERDICT_ORDER, VerdictBadge } from '../components/VerdictBadge'
import { checkCounts, orderFindings, type FindingFilter } from '../lib/checks'
import { KIND_LABELS } from '../lib/findingKinds'
import { useProject } from '../state/project'
import type { Cleared, Finding, Verdict } from '../types/project'

type ChecksFilter = FindingFilter | 'cleared'

const FILTERS: { id: ChecksFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  ...VERDICT_ORDER.map((v) => ({ id: v, label: VERDICT_LABEL[v] })),
  { id: 'cleared', label: 'Checked and fine' },
]

const GROUP_EMPTY: Record<Verdict, string> = {
  fail: 'Nothing failed.',
  review: 'Nothing needs a person.',
  pass: 'Nothing passed yet.',
}

/** Shown before there is anything to check (LoadGate's `empty`, and when files are in but no checks ran). */
export function EmptyChecks() {
  return (
    <section aria-labelledby="no-checks-title" className="mx-auto mt-16 max-w-md rounded-card border border-border bg-surface p-8 text-center">
      <FileUp size={24} aria-hidden="true" className="mx-auto text-ink-2" />
      <h1 id="no-checks-title" className="mt-3 text-[20px] font-semibold">
        No checks yet
      </h1>
      <p className="mt-1 text-ink-2">No checks yet: add the artwork and the approved product information.</p>
      <Link
        to="/evidence"
        className="mt-4 inline-flex items-center gap-1.5 rounded-chip bg-accent px-4 py-2 text-[14px] font-semibold text-white hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info"
      >
        Go to Files
      </Link>
    </section>
  )
}

/** Items the checker looked at and deliberately did not flag, each with the code's proof. Collapsed until opened. */
function ClearedPanel({ items, open, onToggle }: { items: Cleared[]; open: boolean; onToggle: () => void }) {
  const bodyId = useId()
  return (
    <section aria-labelledby="cleared-title" data-group="cleared">
      <h2 id="cleared-title" className="flex flex-wrap items-center gap-2 text-[16px] font-semibold">
        <span className="inline-flex items-center gap-1 rounded-chip bg-ok/10 px-2 py-0.5 text-[12px] font-medium text-ok">
          <CircleCheck size={14} aria-hidden="true" />
          Checked and fine
        </span>
        <span className="font-mono">{items.length}</span>
        <span className="text-[13px] font-normal text-ink-2">looked at and not flagged</span>
      </h2>
      {items.length === 0 ? (
        <p className="mt-2 flex items-center gap-1.5 text-[14px] text-ink-2">
          <ClipboardCheck size={15} aria-hidden="true" />
          Nothing was set aside as fine.
        </p>
      ) : (
        <>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={onToggle}
            className="mt-2 inline-flex items-center gap-1 rounded-chip px-1.5 py-0.5 text-[13px] font-medium text-info hover:underline focus-visible:outline-2 focus-visible:outline-info"
          >
            {open ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
            {open ? 'Hide the proofs' : `Show the proofs (${items.length})`}
          </button>
          <div id={bodyId} hidden={!open}>
            {open && (
              <ul className="mt-2 space-y-3">
                {items.map((c) => (
                  <li key={c.id}>
                    <article data-cleared-id={c.id} aria-labelledby={`cleared-${c.id}-title`} className="rounded-card border border-border bg-surface p-4">
                      <h3 id={`cleared-${c.id}-title`} className="flex items-center gap-1.5 text-[15px] font-semibold">
                        <CircleCheck size={16} aria-hidden="true" className="shrink-0 text-ok" />
                        {c.title}
                      </h3>
                      <div className="mt-2">
                        <ProofLine basis="code" proof={c.proof} />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label={`Evidence for ${c.title}`}>
                        <SourceChips sources={c.evidence} />
                      </div>
                    </article>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  )
}

const ROW_ICON: Record<Verdict, { Icon: LucideIcon; cls: string }> = {
  fail: { Icon: CircleX, cls: 'text-bad' },
  review: { Icon: CircleAlert, cls: 'text-warn' },
  pass: { Icon: CircleCheck, cls: 'text-ok' },
}

/** One finding as a one-line row; the full card opens in the detail pane. The group heading says the verdict in words. */
function FindingRow({ finding: f, selected, onSelect }: { finding: Finding; selected: boolean; onSelect: () => void }) {
  const { Icon, cls } = ROW_ICON[f.verdict]
  return (
    <button
      type="button"
      data-finding-row
      data-finding-id={f.id}
      data-verdict={f.verdict}
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
      className={`flex w-full min-w-0 items-center gap-2 rounded-chip border px-2.5 py-1.5 text-left text-[14px] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-info ${
        selected ? 'border-accent bg-accent/10' : 'border-transparent hover:border-border hover:bg-surface'
      }`}
    >
      <Icon size={15} aria-hidden="true" className={`shrink-0 ${cls}`} />
      <span className="min-w-0 flex-1 truncate" title={f.title}>
        {f.title}
      </span>
      {f.decision && (
        <span className="inline-flex shrink-0 items-center gap-1 text-[12px] text-ink-2">
          <UserRound size={12} aria-hidden="true" />
          {f.decision.verdict === 'pass' ? 'Decided: fine' : 'Decided: a problem'}
        </span>
      )}
      <span className="hidden shrink-0 text-[12px] text-ink-2 sm:inline">{KIND_LABELS[f.kind]}</span>
    </button>
  )
}

/** Fail / Needs review / Pass as rows beside a detail pane holding the selected finding's full card. */
export function Checks() {
  const { project, decisionError } = useProject()
  const [filter, setFilter] = useState<ChecksFilter>('all')
  const [clearedOpen, setClearedOpen] = useState(false)
  const [params] = useSearchParams()
  const wanted = params.get('finding')
  const rootRef = useRef<HTMLElement>(null)
  const paneRef = useRef<HTMLElement>(null)
  const findings = project.findings
  const cleared = project.cleared
  const counts = useMemo(() => checkCounts(findings), [findings])
  const total = findings.length

  const shown = VERDICT_ORDER.filter((v) => filter === 'all' || filter === v)
  const groups = useMemo(
    () => VERDICT_ORDER.map((v) => ({ v, list: orderFindings(findings.filter((f) => f.verdict === v)) })),
    [findings],
  )
  const visible = groups.filter((g) => shown.includes(g.v)).flatMap((g) => g.list)
  const known = wanted != null && findings.some((f) => f.id === wanted)
  const [selectedId, setSelectedId] = useState<string | null>(known ? wanted : null)
  // The selection follows the filter: a finding the filter hides gives way to the first one shown.
  const selected = visible.find((f) => f.id === selectedId) ?? visible[0] ?? null
  const position = selected ? visible.indexOf(selected) : -1

  const select = (f: Finding | undefined, { focusRow = false } = {}) => {
    if (!f) return
    setSelectedId(f.id)
    const row = rootRef.current?.querySelector<HTMLElement>(`[data-finding-row][data-finding-id="${CSS.escape(f.id)}"]`)
    if (focusRow) row?.focus()
    row?.scrollIntoView?.({ block: 'nearest' })
    paneRef.current?.scrollTo?.({ top: 0 })
  }

  // /checks?finding=<id> (from the Rules screen) selects that finding and focuses its card.
  useEffect(() => {
    if (!wanted || !known) return
    setFilter('all')
    setSelectedId(wanted)
    const t = setTimeout(() => {
      const row = rootRef.current?.querySelector<HTMLElement>(`[data-finding-row][data-finding-id="${CSS.escape(wanted)}"]`)
      row?.scrollIntoView?.({ block: 'center' })
      paneRef.current?.querySelector<HTMLElement>('[data-finding-card]')?.focus()
    }, 0)
    return () => clearTimeout(t)
  }, [wanted, known])

  // J / K move between findings (UI.md §8); 1 / 2 / 3 pick "It's fine" / "It's a problem" / "Ask someone" on a review card.
  const keys = useRef({ visible, position, select })
  keys.current = { visible, position, select }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable)) return
      const { visible, position, select } = keys.current
      const k = e.key.toLowerCase()
      if (k === 'j' || k === 'k') {
        if (!visible.length) return
        e.preventDefault()
        const next = k === 'j' ? Math.min(visible.length - 1, position + 1) : Math.max(0, position - 1)
        select(visible[next], { focusRow: true })
      } else if (['1', '2', '3'].includes(k)) {
        const b = paneRef.current?.querySelector<HTMLButtonElement>(`[data-review-controls] [aria-keyshortcuts="${k}"]`)
        if (b) {
          e.preventDefault()
          b.click()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (total === 0) return <EmptyChecks />

  const countOf = (id: ChecksFilter) => (id === 'all' ? total : id === 'cleared' ? cleared.length : counts[id])
  const showCleared = filter === 'all' || filter === 'cleared'
  const navButton = 'inline-flex h-7 w-7 items-center justify-center rounded-chip border border-border bg-surface hover:border-ink-2 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-info'

  return (
    <section ref={rootRef} aria-labelledby="checks-title" className="mx-auto max-w-[1320px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 id="checks-title" className="text-[20px] font-semibold">
            Checks
          </h1>
          <p className="text-[14px] text-ink-2">
            {project.rulebook ? `Checked against the market rules and ${project.rulebook.name}.` : 'Checked against the market rules.'} Every result shows its
            evidence.
          </p>
        </div>
        <div role="group" aria-label="Filter checks" className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => {
                setFilter(f.id)
                setClearedOpen(f.id === 'cleared')
              }}
              className={`rounded-chip border px-2.5 py-1 text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-info ${
                filter === f.id ? 'border-accent bg-accent text-white' : 'border-border bg-surface text-ink hover:border-ink-2'
              }`}
            >
              {f.label} <span className="font-mono">{countOf(f.id)}</span>
            </button>
          ))}
        </div>
      </div>

      {!project.rulebook && (
        <p role="status" className="mt-4 flex items-start gap-2 rounded-card border border-info/40 bg-info/10 p-3 text-[14px]">
          <Info size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-info" />
          <span>No rulebook added: only the market rules were checked.</span>
        </p>
      )}

      {decisionError && (
        <p role="alert" className="mt-4 flex items-start gap-1.5 rounded-card border border-bad/30 bg-bad/10 p-3 text-[14px]">
          <CircleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-bad" />
          {decisionError}
        </p>
      )}

      <div className={`mt-4 gap-5 ${filter === 'cleared' ? '' : 'lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]'}`}>
        <div className="min-w-0 space-y-5">
          {groups
            .filter((g) => shown.includes(g.v))
            .map(({ v, list }) => {
              const headId = `group-${v}-title`
              return (
                <section key={v} aria-labelledby={headId} data-group={v}>
                  <h2 id={headId} className="flex flex-wrap items-center gap-2 text-[16px] font-semibold">
                    <VerdictBadge verdict={v} />
                    <span className="font-mono">{list.length}</span>
                    {v === 'review' && list.length > 0 && (
                      <span className="text-[13px] font-normal text-ink-2">
                        {counts.undecided === 0 ? 'all decided' : `${counts.undecided} left to decide`}
                      </span>
                    )}
                  </h2>
                  {list.length === 0 ? (
                    <p className="mt-2 flex items-center gap-1.5 text-[14px] text-ink-2">
                      <ClipboardCheck size={15} aria-hidden="true" />
                      {GROUP_EMPTY[v]}
                    </p>
                  ) : (
                    <ul className="mt-1.5 space-y-0.5">
                      {list.map((f) => (
                        <li key={f.id}>
                          <FindingRow finding={f} selected={selected?.id === f.id} onSelect={() => select(f)} />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )
            })}
          {showCleared && <ClearedPanel items={cleared} open={clearedOpen} onToggle={() => setClearedOpen((o) => !o)} />}
        </div>

        {filter !== 'cleared' && selected && (
          <aside
            ref={paneRef}
            aria-label="Selected finding"
            data-detail
            className="mt-5 min-w-0 lg:sticky lg:top-4 lg:mt-0 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto"
          >
            <div className="mb-2 flex items-center justify-between gap-2 text-[13px] text-ink-2">
              <span>
                Finding <span className="font-mono">{position + 1}</span> of <span className="font-mono">{visible.length}</span>
                <span className="hidden sm:inline"> · J / K to move</span>
              </span>
              <span className="flex gap-1">
                <button type="button" className={navButton} aria-label="Previous finding" disabled={position <= 0} onClick={() => select(visible[position - 1])}>
                  <ChevronLeft size={15} aria-hidden="true" />
                </button>
                <button type="button" className={navButton} aria-label="Next finding" disabled={position >= visible.length - 1} onClick={() => select(visible[position + 1])}>
                  <ChevronRight size={15} aria-hidden="true" />
                </button>
              </span>
            </div>
            <FindingCard key={selected.id} finding={selected} />
          </aside>
        )}
      </div>
    </section>
  )
}
