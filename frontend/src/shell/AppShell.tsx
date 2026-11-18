import { CircleDashed, Construction } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { useProject } from '../state/project'
import { AskPanel } from './AskPanel'
import { LeftRail } from './LeftRail'
import { SourceDrawer } from './SourceDrawer'
import { TopBar } from './TopBar'

/** The checks shown are from before a file was updated: say so, with the way forward. */
function OutOfDateBanner() {
  const { stale, change, run, runAnalysis } = useProject()
  const { pathname } = useLocation()
  if (!stale || !change) return null
  const running = run.phase === 'running'
  return (
    <div role="status" data-out-of-date className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-warn/40 bg-warn/10 p-3 text-[14px]">
      <CircleDashed size={18} aria-hidden="true" className="shrink-0 text-warn" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">Out of date.</span> {change.fileName} was updated to v{change.versionTo}. These are the v{change.versionFrom} results.
      </p>
      {pathname !== '/changes' && (
        <Link to="/changes" className="rounded-chip border border-border bg-surface px-3 py-1 text-[13px] font-medium hover:border-ink-2 focus-visible:outline-2 focus-visible:outline-info">
          Review the changes
        </Link>
      )}
      <button
        type="button"
        onClick={() => void runAnalysis()}
        disabled={running}
        className="rounded-chip bg-accent px-3 py-1 text-[13px] font-semibold text-white hover:bg-accent/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-info"
      >
        {running ? 'Checking…' : 'Check again'}
      </button>
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const { ask, toggleAsk, closeAsk } = useProject()
  return (
    <div className="min-h-screen bg-bg">
      <TopBar askOpen={ask.open} onAsk={toggleAsk} />
      <div className="flex">
        <LeftRail />
        <main className="min-w-0 flex-1 p-6">
          <OutOfDateBanner />
          {children}
        </main>
      </div>
      <AskPanel open={ask.open} onClose={closeAsk} />
      <SourceDrawer />
    </div>
  )
}

export function NotFound() {
  return (
    <section className="mx-auto mt-16 max-w-md rounded-card border border-border bg-surface p-8 text-center">
      <Construction size={24} aria-hidden="true" className="mx-auto text-ink-2" />
      <h1 className="mt-3 text-[20px] font-semibold">Page not found</h1>
      <p className="mt-1 text-ink-2">Pick a step on the left.</p>
    </section>
  )
}

export function NotBuilt({ title, phase }: { title: string; phase: string }) {
  return (
    <section className="mx-auto mt-16 max-w-md rounded-card border border-border bg-surface p-8 text-center">
      <Construction size={24} aria-hidden="true" className="mx-auto text-ink-2" />
      <h1 className="mt-3 text-[20px] font-semibold">{title}</h1>
      <p className="mt-1 text-ink-2">Built in Phase {phase}.</p>
    </section>
  )
}
