import { sourceShort } from '../lib/labels'
import { useProject } from '../state/project'
import { stateLabel } from './StateBadge'

const DOT: Record<string, string> = {
  confirmed: 'bg-ok',
  pass: 'bg-ok',
  ai_suggested: 'bg-ai',
  missing: 'border-2 border-warn bg-transparent',
}

/**
 * Small source dots at the end of a brief sentence: one per fact. Hover (title) = the source and quote,
 * click = Source Drawer. The state is spelled out in the accessible name, never colour alone.
 * `refs` numbers the facts for the printed version (superscripts).
 */
export function SourceDots({ factIds, refs }: { factIds: string[]; refs?: Map<string, number> }) {
  const { project, openSource } = useProject()
  if (factIds.length === 0) return null
  return (
    <span data-testid="source-dots" className="ml-1 inline-flex items-center align-baseline">
      {factIds.map((id) => {
        const fact = project.facts.find((f) => f.id === id)
        const src = fact?.sources[0]
        const file = src ? project.files.find((f) => f.id === src.fileId) : undefined
        const where = src ? sourceShort(src, file) : null
        const name = !fact
          ? `Unknown fact ${id}`
          : src
            ? `Source for ${fact.field} (${stateLabel(fact.state)}): ${where}`
            : `${fact.field} (${stateLabel(fact.state)}): no source file`
        const title = src ? `${fact?.field} · ${where}\n“${src.quote}”${src.quoteChecked ? '' : ' (quote not checked)'}` : name
        return (
          <span key={id} className="no-print">
            <button
              type="button"
              disabled={!src}
              aria-label={name}
              title={title}
              data-fact={id}
              onClick={() => src && openSource(src)}
              className="group inline-flex h-5 w-4 items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-info disabled:cursor-default"
            >
              <span
                aria-hidden="true"
                className={`block h-2 w-2 rounded-full group-enabled:group-hover:scale-125 ${fact ? (DOT[fact.state] ?? 'bg-ink-2') : 'border-2 border-bad bg-transparent'}`}
              />
            </button>
          </span>
        )
      })}
      {refs && (
        <sup className="print-only font-mono text-[10px]">
          [{factIds.map((id) => refs.get(id)).filter((n) => n != null).join(', ')}]
        </sup>
      )}
    </span>
  )
}
