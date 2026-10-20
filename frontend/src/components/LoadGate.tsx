import { CircleAlert, FileUp, Info, RotateCcw } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useProject } from '../state/project'

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`h-3 animate-pulse rounded-[4px] bg-border ${className}`} />
}

export function LoadingSkeleton({ label = 'Loading project' }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="mx-auto max-w-[960px] space-y-3">
      <span className="sr-only">{label}…</span>
      <Skeleton className="h-6 w-40" />
      {[0, 1, 2].map((i) => (
        <div key={i} aria-hidden="true" className="space-y-2 rounded-card border border-border bg-surface p-4">
          <Skeleton className="w-1/3" />
          <Skeleton className="w-3/4" />
          <Skeleton className="w-2/3" />
        </div>
      ))}
    </div>
  )
}

export function LoadError({ reason, onRetry }: { reason: string; onRetry: () => void }) {
  return (
    <div role="alert" className="mx-auto mt-8 flex max-w-xl items-start gap-3 rounded-card border border-bad/30 bg-bad/10 p-4">
      <CircleAlert size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-bad" />
      <div className="min-w-0">
        <h2 className="text-[16px] font-semibold">The project could not be loaded</h2>
        <p className="mt-1 text-[14px]">{reason}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex items-center gap-1.5 rounded-chip border border-border bg-surface px-3 py-1.5 text-[13px] font-medium hover:border-ink-2 focus-visible:outline-2 focus-visible:outline-info"
        >
          <RotateCcw size={14} aria-hidden="true" />
          Retry
        </button>
      </div>
    </div>
  )
}

export function EmptyProject() {
  return (
    <section className="mx-auto mt-16 max-w-md rounded-card border border-border bg-surface p-8 text-center">
      <FileUp size={24} aria-hidden="true" className="mx-auto text-ink-2" />
      <h1 className="mt-3 text-[20px] font-semibold">No files yet</h1>
      <p className="mt-1 text-ink-2">No files yet — drop your packaging files to start.</p>
      <Link
        to="/evidence"
        className="mt-4 inline-flex items-center gap-1.5 rounded-chip bg-accent px-4 py-2 text-[14px] font-semibold text-white hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info"
      >
        Go to Evidence
      </Link>
    </section>
  )
}

/**
 * Wraps a screen that needs project data: skeletons while loading, an error with a reason and Retry,
 * the empty state before any upload (`empty` replaces the default one), and a partial-state banner when some files failed or no analysis ran.
 */
export function LoadGate({ children, empty }: { children: ReactNode; empty?: ReactNode }) {
  const { load, project, reload } = useProject()
  if (load.status === 'loading') return <LoadingSkeleton />
  if (load.status === 'error') return <LoadError reason={load.reason} onRetry={() => void reload()} />
  if (load.status === 'empty' || project.files.length === 0) return <>{empty ?? <EmptyProject />}</>

  const failed = project.files.filter((f) => f.status === 'error')
  const notRun = project.facts.length === 0 && failed.length < project.files.length
  return (
    <>
      {failed.length > 0 && (
        <p role="status" className="mb-4 flex items-start gap-2 rounded-card border border-warn/40 bg-warn/10 p-3 text-[14px]">
          <Info size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-warn" />
          <span>
            Partial result: {project.files.length - failed.length} of {project.files.length} files read. {failed.map((f) => f.name).join(', ')} could
            not be read, so everything here comes from the other files. <Link to="/evidence" className="font-medium underline">See Evidence</Link>
          </span>
        </p>
      )}
      {notRun && (
        <p role="status" className="mb-4 flex items-start gap-2 rounded-card border border-info/40 bg-info/10 p-3 text-[14px]">
          <Info size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-info" />
          <span>
            The files are uploaded but not analysed yet, so there are no facts. <Link to="/evidence" className="font-medium underline">Run the analysis on Evidence</Link>
          </span>
        </p>
      )}
      {children}
    </>
  )
}
