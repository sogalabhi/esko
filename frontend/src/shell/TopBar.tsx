import { CircleAlert, CircleCheck, CircleDashed, CircleX, Download, PackagePlus, RefreshCw, RotateCcw, Search } from 'lucide-react'
import { Link } from 'react-router'
import { printVerdict } from '../lib/checks'
import { formatValue, titleCase } from '../lib/labels'
import { packFileId } from '../lib/markup'
import { useProject, type UiMarket } from '../state/project'
import type { Project } from '../types/project'
import { BackendStatus } from './BackendStatus'

export const MARKETS: { id: UiMarket; label: string }[] = [
  { id: 'US', label: 'United States' },
  { id: 'IN', label: 'India' },
]

const btnBase =
  'inline-flex items-center gap-1.5 rounded-chip border px-3 py-1.5 text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-info'
const btn = `${btnBase} border-border bg-surface hover:border-ink-2`

const MODE_META = {
  redesign: { word: 'Redesign', Icon: RefreshCw, reason: 'A pack file is among the inputs' },
  new_product: { word: 'New product', Icon: PackagePlus, reason: 'No pack file among the inputs' },
} as const

/** The project's mode (PLAN "Two modes"): from the backend when it says, else from whether a pack file is in. */
export function projectMode(project: Project): { mode: keyof typeof MODE_META; reason: string } | null {
  if (project.mode) return { mode: project.mode, reason: project.modeReason ?? MODE_META[project.mode].reason }
  if (project.files.length === 0) return null
  const mode = packFileId(project) ? 'redesign' : 'new_product'
  return { mode, reason: MODE_META[mode].reason }
}

export function ModeChip({ project }: { project: Project }) {
  const m = projectMode(project)
  if (!m) return null
  const { word, Icon } = MODE_META[m.mode]
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-chip border border-border px-2 py-0.5 text-[12px] font-medium text-ink-2"
      title={m.reason}
      aria-label={`Mode: ${word}. ${m.reason}`}
      data-mode={m.mode}
    >
      <Icon size={13} aria-hidden="true" />
      {word}
    </span>
  )
}

export function HealthRing({ percent, open }: { percent: number; open: number }) {
  const r = 14
  const c = 2 * Math.PI * r
  return (
    <span className="flex items-center gap-2 text-[13px]" aria-label={`Required items: ${percent}% met, ${open} open`} role="img">
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
        <span className="font-mono font-semibold">{percent}%</span> met · <span className="font-mono">{open}</span> open
      </span>
    </span>
  )
}

/** "Not ready to print: N fail · M review" or "Ready to print". Review = undecided review items. */
export function VerdictLine({ findings }: { findings: Project['findings'] }) {
  const v = printVerdict(findings)
  let Icon = CircleDashed
  let cls = 'text-ink-2'
  let text = 'No checks yet'
  let name = 'Print verdict: no checks yet'
  if (v.checked && v.ready) {
    Icon = CircleCheck
    cls = 'text-ok'
    text = 'Ready to print'
    name = 'Print verdict: ready to print, no fails and nothing left to review'
  } else if (v.checked) {
    Icon = v.fail ? CircleX : CircleAlert
    cls = v.fail ? 'text-bad' : 'text-warn'
    text = `Not ready to print: ${v.fail} fail · ${v.review} review`
    name = `Print verdict: not ready to print, ${v.fail} fail and ${v.review} to review`
  }
  return (
    <Link
      to="/checks"
      data-verdict-line
      aria-label={`${name}. Open Checks`}
      title="Open Checks"
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-chip px-2 py-1 text-[13px] font-semibold hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-info ${cls}`}
    >
      <Icon size={16} aria-hidden="true" />
      {text}
    </Link>
  )
}

export function TopBar({ askOpen = false, onAsk }: { askOpen?: boolean; onAsk?: () => void } = {}) {
  const { project, market, reset } = useProject()
  const marketLabel = MARKETS.find((m) => m.id === market)?.label ?? market

  // §9 has no product block; derive the name from the identity and net quantity facts.
  const identity = project.facts.find((f) => f.field === 'Statement of identity')
  const net = project.facts.find((f) => f.field === 'Net quantity')
  const product = [identity?.value ? titleCase(identity.value) : 'Untitled product', net ? formatValue(net) : '']
    .filter(Boolean)
    .join(' · ')

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

      {/* No mode chip: the checker always has finished artwork (ModeChip stays for the brief, if it returns). */}

      {/* One market for now: the switch and the launch date return when the other market packs are finished. */}
      <span className="shrink-0 rounded-chip border border-border px-2.5 py-1 text-[13px] font-medium text-ink" aria-label={`Market: ${marketLabel}`}>
        {marketLabel}
      </span>

      <div className="ml-auto flex shrink-0 items-center gap-3">
        <VerdictLine findings={project.findings} />
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
        <button type="button" className={`${btnBase} border-accent bg-accent text-white`} onClick={exportJson}>
          <Download size={14} aria-hidden="true" />
          Export
        </button>
      </div>
    </header>
  )
}
