import { Maximize2, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

/** "Expand" button plus a wide panel over the content. Esc or Close dismisses it and focus returns to the button. */
export function ExpandDialog({ title, children, buttonLabel = 'Expand' }: { title: string; children: ReactNode; buttonLabel?: string }) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const closeBtn = useRef<HTMLButtonElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    closeBtn.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
        btn.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const close = () => {
    setOpen(false)
    btn.current?.focus()
  }

  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`${buttonLabel} ${title}`}
        className="inline-flex items-center gap-1 rounded-chip border border-border bg-surface px-2 py-1 text-[12px] font-medium text-ink hover:border-ink-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-info"
      >
        <Maximize2 size={12} aria-hidden="true" />
        {buttonLabel}
      </button>
      {open && (
        <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6" onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-full w-full max-w-[1100px] flex-col rounded-card border border-border bg-surface shadow-lg">
            <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h2 id={titleId} className="text-[16px] font-semibold">{title}</h2>
              <button
                ref={closeBtn}
                type="button"
                onClick={close}
                className="inline-flex items-center gap-1 rounded-chip border border-border bg-surface px-2.5 py-1 text-[13px] font-medium hover:border-ink-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-info"
              >
                <X size={14} aria-hidden="true" />
                Close
              </button>
            </header>
            <div className="overflow-auto p-4">{children}</div>
          </div>
        </div>
      )}
    </>
  )
}
