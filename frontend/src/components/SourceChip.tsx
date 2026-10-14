import { FileSpreadsheet, FileText } from 'lucide-react'
import { sourceShort } from '../lib/labels'
import { useProject } from '../state/project'
import type { Source } from '../types/project'

export function SourceChip({ source }: { source: Source }) {
  const { project, openSource } = useProject()
  const file = project.files.find((f) => f.id === source.fileId)
  const Icon = file?.type === 'sheet' ? FileSpreadsheet : FileText
  const label = sourceShort(source, file)
  return (
    <button
      type="button"
      onClick={() => openSource(source)}
      title={source.quote}
      className="inline-flex max-w-full items-center gap-1 rounded-chip border border-border bg-surface px-2 py-0.5 font-mono text-[12px] text-ink hover:border-ink-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-info"
    >
      <Icon size={13} aria-hidden="true" className="shrink-0 text-ink-2" />
      <span className="truncate">{label}</span>
      {!source.quoteChecked && <span className="sr-only"> (quote not checked)</span>}
    </button>
  )
}

/** Several sources: stacked pills. */
export function SourceChips({ sources }: { sources: Source[] }) {
  if (sources.length === 0) return <span className="text-[12px] text-ink-2">No source</span>
  return (
    <span className="flex flex-wrap gap-1">
      {sources.map((s, i) => (
        <SourceChip key={`${s.fileId}-${s.where.cell ?? s.where.panel ?? ''}-${i}`} source={s} />
      ))}
    </span>
  )
}
