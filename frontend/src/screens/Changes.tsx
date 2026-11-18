import { ArrowRight, GitCompareArrows } from 'lucide-react'
import { Link } from 'react-router'
import { CheckAgainPanel, DecisionsCarried, FindingMoves, fmtDate, ImpactHero, PieceChangeRow, TokenLine, VersionTimeline } from '../components/ChangeParts'
import { useProject } from '../state/project'
import type { ChangeReport } from '../types/project'

function VersionCard({ change, latest }: { change: ChangeReport; latest: boolean }) {
  const { project, run, runAnalysis } = useProject()
  const p = change.pieces
  const was = project.history?.find((h) => h.version === `v${change.versionFrom}`)?.counts
  const running = run.phase === 'running' || run.phase === 'uploading'
  const fixed = change.findings?.resolved.length
  return (
    <details open={latest} className="group rounded-card border border-border bg-bg" data-version-card={`v${change.versionTo}`}>
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 p-4 focus-visible:outline-2 focus-visible:outline-info">
        <span className="rounded-chip bg-surface px-2 py-0.5 font-mono text-[13px] font-semibold">
          v{change.versionFrom} <ArrowRight size={12} aria-hidden="true" className="inline" /> v{change.versionTo}
        </span>
        <span className="text-[15px] font-semibold">{change.fileName}</span>
        <span className="text-[13px] text-ink-2">
          {change.by} · {fmtDate(change.at)}
        </span>
        {fixed != null && (
          <span className="ml-auto text-[13px]">
            <span className="font-mono font-semibold">{fixed}</span> fixed · <span className="font-mono">{change.findings?.new.length}</span> new
          </span>
        )}
      </summary>
      <div className="space-y-4 border-t border-border p-4">
        {change.findings ? (
          <>
            <ImpactHero change={change} was={was} />
            <FindingMoves change={change} />
            <DecisionsCarried change={change} />
          </>
        ) : latest ? (
          <CheckAgainPanel change={change} running={running} onCheckAgain={() => void runAnalysis()} />
        ) : null}

        <section aria-labelledby={`in-file-${change.versionTo}`}>
          <h3 id={`in-file-${change.versionTo}`} className="text-[13px] font-semibold text-ink-2">
            In the file · replaces {change.oldName} · <span className="font-mono">{p.changed}</span> changed · <span className="font-mono">{p.added}</span> added ·{' '}
            <span className="font-mono">{p.removed}</span> removed · <span className="font-mono">{p.unchanged}</span> unchanged
          </h3>
          {p.changes.length === 0 ? (
            <p className="mt-2 text-[13px] text-ink-2">The file is different, but no text we read changed (for example only images or layout).</p>
          ) : (
            <ul aria-label="Text that changed" className="mt-2 space-y-2">
              {p.changes.map((c, i) => (
                <PieceChangeRow key={i} c={c} />
              ))}
            </ul>
          )}
        </section>

        <TokenLine tokens={change.tokens} />
      </div>
    </details>
  )
}

/** Every update of a file: what changed in it, what that did to the checks, and what happened to earlier decisions. */
export function Changes() {
  const { changes, project, stale } = useProject()
  const history = project.history ?? []
  if (changes.length === 0) {
    return (
      <section className="mx-auto mt-16 max-w-md rounded-card border border-border bg-surface p-8 text-center">
        <GitCompareArrows size={24} aria-hidden="true" className="mx-auto text-ink-2" />
        <h1 className="mt-3 text-[20px] font-semibold">No file has been updated yet</h1>
        <p className="mt-1 text-ink-2">To check a new version of a file, use “Update this file” on the Files screen. What changed will show here.</p>
        <Link to="/evidence" className="mt-4 inline-flex items-center gap-1.5 rounded-chip bg-accent px-4 py-2 text-[14px] font-semibold text-white hover:bg-accent/90">
          Go to Files
        </Link>
      </section>
    )
  }
  const ordered = [...changes].reverse()
  return (
    <div className="mx-auto max-w-[960px]" aria-busy={stale || undefined}>
      <h1 className="text-[20px] font-semibold">What changed</h1>
      <p className="mt-1 text-[13px] text-ink-2">Every update of a file: what changed in it, what that did to the checks, and what happened to your earlier decisions.</p>
      {project.scenario && <p className="mt-2 rounded-chip border border-warn px-2 py-1 text-[12px] font-semibold text-warn">{project.scenario}</p>}
      {history.length > 0 && (
        <div className="mt-4">
          <VersionTimeline history={history} />
        </div>
      )}
      <div className="mt-5 space-y-3">
        {ordered.map((c, i) => (
          <VersionCard key={c.versionTo} change={c} latest={i === 0} />
        ))}
      </div>
    </div>
  )
}
