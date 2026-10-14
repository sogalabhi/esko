import { Check, Copy } from 'lucide-react'
import { useId, useState } from 'react'

/** A short message to copy to R&D, legal or brand ("Ask someone"). */
export function AskMessage({ message }: { message: string }) {
  const id = useId()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(message)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="mt-3 rounded-card border border-border bg-bg p-3">
      <label htmlFor={id} className="text-[12px] font-medium text-ink-2">
        Message to copy
      </label>
      <textarea
        id={id}
        readOnly
        value={message}
        rows={5}
        className="mt-1 w-full resize-none rounded-chip border border-border bg-surface p-2 text-[13px] text-ink focus-visible:outline-2 focus-visible:outline-info"
      />
      <button
        type="button"
        onClick={copy}
        className="mt-2 inline-flex items-center gap-1 rounded-chip border border-border bg-surface px-3 py-1 text-[13px] font-medium hover:border-ink-2 focus-visible:outline-2 focus-visible:outline-info"
      >
        {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        {copied ? 'Copied' : 'Copy message'}
      </button>
    </div>
  )
}
