import { CircleAlert, RotateCcw } from 'lucide-react'
import { Skeleton } from './LoadGate'

/** Stand-in for the carton while the backend draws its page: a skeleton with the words, in the frame the artwork will fill. */
export function CartonDrawing({ ratio }: { ratio: string }) {
  return (
    <div role="status" className="relative w-full" style={{ aspectRatio: ratio }}>
      <Skeleton className="absolute inset-[5%_14%] h-auto rounded-card" />
      <p className="absolute inset-0 flex items-center justify-center text-[13px] font-medium text-ink-2">Drawing the carton…</p>
    </div>
  )
}

/** The page could not be drawn: the reason, what happens instead, and a Retry. */
export function CartonError({ reason, then, onRetry }: { reason: string; then: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-chip border border-warn/40 bg-warn/10 px-3 py-2 text-[13px]">
      <CircleAlert size={15} aria-hidden="true" className="shrink-0 text-warn" />
      <span className="flex-1">
        The carton PDF could not be drawn: {reason}. {then}
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-chip border border-border bg-surface px-3 py-1.5 text-[13px] font-medium text-ink hover:border-ink-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-info"
      >
        <RotateCcw size={14} aria-hidden="true" />
        Retry
      </button>
    </div>
  )
}
