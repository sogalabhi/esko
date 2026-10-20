import { CircleAlert, RotateCcw } from 'lucide-react'
import { LoadDemoButton } from './LoadDemoButton'

const btn =
  'inline-flex items-center gap-1.5 rounded-chip border border-border bg-surface px-3 py-1.5 text-[13px] font-medium hover:border-ink-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-info disabled:cursor-not-allowed disabled:opacity-60'

/**
 * Shown where an AI step failed because the service is rate-limited or overloaded.
 * Retry repeats the exact failed action; "Load demo" is offered as another way forward where it makes sense.
 */
export function AiBusyNotice({
  message,
  onRetry,
  disabled = false,
  suggestDemo = false,
  className = '',
}: {
  message: string
  onRetry?: () => void
  disabled?: boolean
  suggestDemo?: boolean
  className?: string
}) {
  return (
    <div role="alert" data-ai-busy className={`flex items-start gap-2 rounded-card border border-warn/40 bg-warn/10 p-3 text-[14px] ${className}`}>
      <CircleAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-warn" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{message}</p>
        {(onRetry || suggestDemo) && (
          <div className="mt-2 flex flex-wrap items-start gap-2">
            {onRetry && (
              <button type="button" onClick={onRetry} disabled={disabled} className={btn}>
                <RotateCcw size={14} aria-hidden="true" />
                Retry
              </button>
            )}
            {suggestDemo && (
              <span className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
                Or look around with the saved demo:
                <LoadDemoButton label="Load demo" toast={false} />
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
