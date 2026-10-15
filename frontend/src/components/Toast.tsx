import { X } from 'lucide-react'
import { useEffect } from 'react'

interface Props {
  message: string
  actionLabel?: string
  onAction?: () => void
  onDismiss: () => void
  /** Auto-hide after this many ms; 0 keeps it until dismissed. */
  timeoutMs?: number
}

/** One short message at the bottom of the screen, with an optional action (e.g. Undo). */
export function Toast({ message, actionLabel, onAction, onDismiss, timeoutMs = 8000 }: Props) {
  useEffect(() => {
    if (!timeoutMs) return
    const t = setTimeout(onDismiss, timeoutMs)
    return () => clearTimeout(t)
  }, [message, timeoutMs, onDismiss])

  return (
    <div
      role="status"
      aria-live="polite"
      className="toast-in fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-card bg-ink px-4 py-2.5 text-[14px] text-white shadow-sm"
    >
      <span>{message}</span>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="rounded-chip px-2 py-0.5 font-semibold text-white underline underline-offset-2 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
        >
          {actionLabel}
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="rounded-chip p-0.5 text-white/80 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  )
}
