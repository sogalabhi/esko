import { Download, RotateCcw, Search } from 'lucide-react'
import { useId } from 'react'
import { formatValue, titleCase } from '../lib/labels'
import { useProject, type UiMarket } from '../state/project'
import { BackendStatus } from './BackendStatus'

const MARKETS: { id: UiMarket; label: string }[] = [
  { id: 'US', label: 'United States' },
  { id: 'IN', label: 'India' },
]

const btn =
  'inline-flex items-center gap-1.5 rounded-chip border border-border bg-surface px-3 py-1.5 text-[13px] font-medium hover:border-ink-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-info'

const SLIDER_MAX = 24
const TODAY = new Date().toISOString().slice(0, 10)
function addMonths(base: string, months: number): string {
  const d = new Date(`${base}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().slice(0, 10)
}
function monthsFrom(base: string, date: string): number {
  const a = new Date(`${base}T00:00:00Z`)
  const b = new Date(`${date}T00:00:00Z`)
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth())
}

export function HealthRing({ percent, open }: { percent: number; open: number }) {
  const r = 14
  const c = 2 * Math.PI * r
  return (
    <span className="flex items-center gap-2 text-[13px]" aria-label={`Brief health: ${percent}% proven, ${open} open`} role="img">
      <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
        <circle cx="17" cy="17" r={r} fill="none" stroke="var(--border)" strokeWidth="4" />
        <circle
          cx="17"
          cy="17"
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="4"
          strokeDasharray={`${(c * percent) / 100} ${c}`}
          transform="rotate(-90 17 17)"
        />
      </svg>
      <span className="whitespace-nowrap">
        <span className="font-mono font-semibold">{percent}%</span> proven · <span className="font-mono">{open}</span> open
      </span>
    </span>
  )
}

export function TopBar({ askOpen = false, onAsk }: { askOpen?: boolean; onAsk?: () => void } = {}) {
  const { project, market, setMarket, launchDate, setLaunchDate, reset } = useProject()
  const dateId = useId()
  const sliderId = useId()

  // §9 has no product block; derive the name from the identity and net quantity facts.
  const identity = project.facts.find((f) => f.field === 'Statement of identity')
  const net = project.facts.find((f) => f.field === 'Net quantity')
  const product = [identity?.value ? titleCase(identity.value) : 'Untitled product', net ? formatValue(net) : '']
    .filter(Boolean)
    .join(' · ')

  const reqs = project.requirements
  const met = reqs.filter((r) => r.status === 'met').length
  const percent = reqs.length ? Math.round((met / reqs.length) * 100) : 0

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'briefforge-project.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-border bg-surface px-4">
      <p className="min-w-0 truncate text-[16px] font-semibold">{product}</p>

      <div role="radiogroup" aria-label="Market" className="flex shrink-0 rounded-chip border border-border p-0.5">
        {MARKETS.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={market === m.id}
            onClick={() => setMarket(m.id)}
            className={`rounded-[4px] px-2.5 py-1 text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-info ${
              market === m.id ? 'bg-accent text-white' : 'text-ink-2 hover:text-ink'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <label htmlFor={dateId} className="text-[12px] text-ink-2">
          Launch
        </label>
        <input
          id={dateId}
          type="date"
          value={launchDate}
          onChange={(e) => e.target.value && setLaunchDate(e.target.value)}
          className="rounded-chip border border-border bg-surface px-2 py-1 font-mono text-[12px] focus-visible:outline-2 focus-visible:outline-info"
        />
        <label htmlFor={sliderId} className="sr-only">
          Move launch date by months
        </label>
        <input
          id={sliderId}
          type="range"
          min={0}
          max={SLIDER_MAX}
          value={Math.min(SLIDER_MAX, Math.max(0, monthsFrom(TODAY, launchDate)))}
          onChange={(e) => setLaunchDate(addMonths(TODAY, Number(e.target.value)))}
          className="hidden w-20 accent-[var(--accent)] xl:block"
        />
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-3">
        <HealthRing percent={percent} open={reqs.length - met} />
        <BackendStatus />
        {onAsk && (
          <button type="button" className={btn} onClick={onAsk} aria-expanded={askOpen} aria-label="Ask about this" title="Ask about this">
            <Search size={14} aria-hidden="true" />
            <span className="hidden xl:inline" aria-hidden="true">
              Ask about this
            </span>
          </button>
        )}
        <button type="button" className={btn} onClick={reset}>
          <RotateCcw size={14} aria-hidden="true" />
          Reset demo
        </button>
        <button type="button" className={`${btn} border-accent bg-accent text-white hover:border-accent`} onClick={exportJson}>
          <Download size={14} aria-hidden="true" />
          Export
        </button>
      </div>
    </header>
  )
}
