import { Minus, Plus, Repeat } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ConflictCard } from '../components/ConflictCard'
import { SourceChips } from '../components/SourceChip'
import { StateBadge } from '../components/StateBadge'
import { diffIngredients, type DiffItem } from '../lib/ingredients'
import { formatValue, GROUPS, SEVERITY_RANK, sourceShort } from '../lib/labels'
import { useProject } from '../state/project'
import type { Conflict, Fact, Source } from '../types/project'

type Filter = 'all' | 'conflicts' | 'ai' | 'missing' | 'passed'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'conflicts', label: 'Conflicts' },
  { id: 'ai', label: 'AI-suggested' },
  { id: 'missing', label: 'Missing' },
  { id: 'passed', label: 'Passed' },
]

function DiffList({ title, items }: { title: string; items: DiffItem[] }) {
  const tag: Record<DiffItem['status'], { cls: string; word: string; Icon?: typeof Plus } | null> = {
    same: null,
    added: { cls: 'bg-ok/10 text-ok', word: 'Added', Icon: Plus },
    missing: { cls: 'bg-bad/10 text-bad', word: 'Missing', Icon: Minus },
    duplicate: { cls: 'bg-warn/10 text-warn', word: 'Duplicate', Icon: Repeat },
  }
  return (
    <div className="min-w-0">
      <h4 className="text-[12px] font-semibold text-ink-2">{title}</h4>
      <ol className="mt-1 space-y-0.5 text-[13px]">
        {items.map((it, i) => {
          const t = tag[it.status]
          return (
            <li key={i} data-diff={it.status} className={`flex items-center justify-between gap-2 rounded-[4px] px-1.5 py-0.5 ${t?.cls ?? ''}`}>
              <span className="min-w-0 break-words">{it.text}</span>
              {t?.Icon && (
                <span className="flex shrink-0 items-center gap-0.5 text-[11px] font-medium">
                  <t.Icon size={12} aria-hidden="true" />
                  {t.word}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export function IngredientDiff({ left, right, leftTitle, rightTitle }: { left: string; right: string; leftTitle: string; rightTitle: string }) {
  const d = useMemo(() => diffIngredients(left, right), [left, right])
  return (
    <section aria-label="Ingredient list diff" className="rounded-card border border-border bg-bg p-3">
      <h3 className="text-[13px] font-semibold">Ingredient list diff · {leftTitle} vs {rightTitle}</h3>
      <div className="mt-2 grid grid-cols-2 gap-4">
        <DiffList title={leftTitle} items={d.left} />
        <DiffList title={rightTitle} items={d.right} />
      </div>
    </section>
  )
}

export function Facts() {
  const { project, resolveConflict } = useProject()
  const [filter, setFilter] = useState<Filter>('all')

  const openByFact = useMemo(() => {
    const m = new Map<string, Conflict[]>()
    for (const c of project.conflicts) {
      if (c.resolution) continue
      for (const id of c.factIds) m.set(id, [...(m.get(id) ?? []), c])
    }
    return m
  }, [project.conflicts])

  const matches = (f: Fact, flt: Filter) =>
    flt === 'all' ||
    (flt === 'conflicts' && openByFact.has(f.id)) ||
    (flt === 'ai' && f.state === 'ai_suggested') ||
    (flt === 'missing' && f.state === 'missing') ||
    (flt === 'passed' && f.state === 'pass')

  const counts = Object.fromEntries(FILTERS.map(({ id }) => [id, project.facts.filter((f) => matches(f, id)).length])) as Record<Filter, number>

  const conflicts = [...project.conflicts].sort(
    (a, b) => Number(!!a.resolution) - Number(!!b.resolution) || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  )
  const openCount = conflicts.filter((c) => !c.resolution).length
  const sideTitle = (s?: Source) => (s ? sourceShort(s, project.files.find((f) => f.id === s.fileId)) : 'Computed')
  const listConflict = project.conflicts.find((c) => c.kind === 'list' && !c.resolution)

  // J / K move between conflict cards (§8).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return
      const k = e.key.toLowerCase()
      if (k !== 'j' && k !== 'k') return
      const cards = [...document.querySelectorAll<HTMLElement>('[data-conflict-card]')]
      if (!cards.length) return
      const i = cards.findIndex((c) => c.contains(document.activeElement))
      const next = k === 'j' ? Math.min(cards.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1)
      cards[next].focus()
      cards[next].scrollIntoView?.({ block: 'nearest' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (project.facts.length === 0) {
    return (
      <section className="mx-auto mt-16 max-w-md rounded-card border border-border bg-surface p-8 text-center">
        <h1 className="text-[20px] font-semibold">No facts yet</h1>
        <p className="mt-1 text-ink-2">Add packaging files in Evidence to read facts from them.</p>
      </section>
    )
  }

  const visible = project.facts.filter((f) => matches(f, filter))

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section className="min-w-0 lg:col-span-2" aria-labelledby="facts-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 id="facts-title" className="text-[20px] font-semibold">
            Facts
          </h1>
          <div role="group" aria-label="Filter facts" className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={`rounded-chip border px-2.5 py-1 text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-info ${
                  filter === f.id ? 'border-accent bg-accent text-white' : 'border-border bg-surface text-ink hover:border-ink-2'
                }`}
              >
                {f.label} <span className="font-mono">{counts[f.id]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-card border border-border bg-surface">
          <table className="w-full table-fixed text-left text-[14px]">
            <colgroup>
              <col className="w-[22%]" />
              <col />
              <col className="w-[150px]" />
              <col className="w-[180px]" />
            </colgroup>
            <thead className="border-b border-border text-[12px] text-ink-2">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Field</th>
                <th scope="col" className="px-3 py-2 font-medium">Value</th>
                <th scope="col" className="px-3 py-2 font-medium">State</th>
                <th scope="col" className="px-3 py-2 font-medium">Sources</th>
              </tr>
            </thead>
            {GROUPS.map((g) => {
              const rows = visible.filter((f) => f.group === g.id)
              if (!rows.length) return null
              return (
                <tbody key={g.id} aria-label={g.label}>
                  <tr className="bg-bg">
                    <th scope="colgroup" colSpan={4} className="border-y border-border px-3 py-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-2">
                      {g.label}
                    </th>
                  </tr>
                  {rows.map((f) => {
                    const inConflict = openByFact.has(f.id)
                    return (
                      <tr key={f.id} data-fact={f.id} data-conflict={inConflict || undefined} className="border-b border-border align-top last:border-b-0">
                        <th scope="row" className="px-3 py-2 font-medium">{f.field}</th>
                        <td className="px-3 py-2">
                          {f.state === 'missing' ? (
                            <span className="text-ink-2">Not in any file</span>
                          ) : (
                            <span
                              className={`break-words ${f.unit || /^[\d\s.]+$/.test(f.value ?? '') ? 'font-mono' : ''} ${
                                f.state === 'ai_suggested' ? 'underline decoration-ai decoration-dotted decoration-2 underline-offset-4' : ''
                              }`}
                            >
                              {formatValue(f)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span className="flex flex-col items-start gap-1">
                            <StateBadge state={f.state} />
                            {inConflict && <StateBadge state="conflict" />}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {f.sources.length ? <SourceChips sources={f.sources} /> : <span className="text-[12px] text-ink-2">No file has it</span>}
                        </td>
                      </tr>
                    )
                  })}
                  {g.id === 'ingredients' && listConflict && (
                    <tr>
                      <td colSpan={4} className="px-3 py-3">
                        <IngredientDiff
                          left={listConflict.left.value}
                          right={listConflict.right.value}
                          leftTitle={sideTitle(listConflict.left.sources[0])}
                          rightTitle={sideTitle(listConflict.right.sources[0])}
                        />
                      </td>
                    </tr>
                  )}
                </tbody>
              )
            })}
          </table>
          {visible.length === 0 && <p className="p-6 text-center text-ink-2">No facts match this filter.</p>}
        </div>
      </section>

      <aside aria-labelledby="conflicts-title" className="min-w-0 lg:sticky lg:top-[80px] lg:max-h-[calc(100vh-104px)] lg:self-start lg:overflow-auto">
        <h2 id="conflicts-title" className="text-[20px] font-semibold">
          Conflicts <span className="font-mono text-[14px] font-normal text-ink-2">· {openCount} open</span>
        </h2>
        <p className="mt-0.5 text-[12px] text-ink-2">Sorted by severity. J / K to move between cards.</p>
        <div className="mt-3 space-y-3">
          {conflicts.length === 0 && <p className="text-ink-2">No conflicts found.</p>}
          {conflicts.map((c) => (
            <ConflictCard key={c.id} conflict={c} onResolve={(choice) => resolveConflict(c.id, choice)} />
          ))}
        </div>
      </aside>
    </div>
  )
}
