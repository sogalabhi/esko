import { CircleCheck, CircleHelp, CircleX } from 'lucide-react'
import type { HistoryEntry } from '../types/project'

const fmt = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'
}

const Count = ({ icon: Icon, n, word, cls }: { icon: typeof CircleX; n: number; word: string; cls: string }) => (
  <span className={`inline-flex items-center gap-1 rounded-chip px-2 py-0.5 text-[12px] font-medium ${cls}`}>
    <Icon size={13} aria-hidden="true" />
    <span className="font-mono">{n}</span> {word}
  </span>
)

/** The versions of the artwork: who did what, and when. Newest last, like a timeline. */
export function HistoryPanel({ history, note }: { history: HistoryEntry[]; note?: string | null }) {
  return (
    <div data-history-panel>
      {note && <p className="mb-3 text-[13px] text-ink-2">{note} Names are illustrative.</p>}
      <ol aria-label="Version history" className="space-y-3">
        {history.map((h, i) => (
          <li key={i} data-history-entry className="rounded-card border border-border bg-surface p-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="rounded-chip bg-bg px-2 py-0.5 font-mono text-[12px] font-semibold">{h.version}</span>
              <span className="text-[14px] font-semibold">{h.title}</span>
            </div>
            <p className="mt-1 text-[13px] text-ink-2">
              {h.by} · {h.role} · {fmt(h.at)}
            </p>
            {h.detail && <p className="mt-1 text-[13px]">{h.detail}</p>}
            {h.counts && (
              <p className="mt-2 flex flex-wrap gap-1.5">
                <Count icon={CircleX} n={h.counts.fail ?? 0} word="Fail" cls="bg-bad/10 text-bad" />
                <Count icon={CircleHelp} n={h.counts.review ?? 0} word="Needs review" cls="bg-warn/10 text-warn" />
                <Count icon={CircleCheck} n={h.counts.pass ?? 0} word="Pass" cls="bg-ok/10 text-ok" />
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
