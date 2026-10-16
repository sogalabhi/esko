import { ArrowRight, Circle, CircleAlert, CircleCheck, FileText, LoaderCircle, Play, RotateCcw, Upload } from 'lucide-react'
import { useCallback, useEffect, useId, useState, type DragEvent } from 'react'
import { Link } from 'react-router'
import { ACCEPT_ATTR } from '../api/client'
import { LoadError, LoadingSkeleton, Skeleton } from '../components/LoadGate'
import { FILE_META, fileUnits } from '../lib/labels'
import { prefersReducedMotion } from '../lib/motion'
import { useProject, type RunState } from '../state/project'
import type { Fact, PackPanel, ProjectFile } from '../types/project'

const TICK_MS = 100

/**
 * Simulated read progress (0..1) until uploads and the WebSocket are wired.
 * Jumps straight to 1 when durationMs is 0 or the person prefers reduced motion.
 */
function useReadProgress(durationMs: number) {
  const instant = durationMs <= 0 || prefersReducedMotion()
  const [progress, setProgress] = useState(instant ? 1 : 0)
  const [run, setRun] = useState(0)

  useEffect(() => {
    if (instant) return
    const start = Date.now()
    const t = setInterval(() => {
      const p = Math.min(1, (Date.now() - start) / durationMs)
      setProgress(p)
      if (p >= 1) clearInterval(t)
    }, TICK_MS)
    return () => clearInterval(t)
  }, [durationMs, instant, run])

  const restart = useCallback(() => {
    setProgress(instant ? 1 : 0)
    setRun((r) => r + 1)
  }, [instant])
  return { progress, restart }
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}

function CartonThumb({ panels, facts, fileId }: { panels: PackPanel[]; facts: Fact[]; fileId: string }) {
  const boxes = facts.flatMap((f) => f.sources.filter((s) => s.fileId === fileId && s.where.bbox).map((s, i) => ({ key: `${f.id}-${i}`, b: s.where.bbox! })))
  if (panels.length === 0) return <ThumbPlaceholder Icon={FileText} />
  const minX = Math.min(...panels.map((p) => p.x))
  const minY = Math.min(...panels.map((p) => p.y))
  const maxX = Math.max(...panels.map((p) => p.x + p.w))
  const maxY = Math.max(...panels.map((p) => p.y + p.h))
  return (
    <svg
      role="img"
      aria-label={`Carton thumbnail, ${plural(boxes.length, 'fact')} located`}
      viewBox={`${minX - 4} ${minY - 4} ${maxX - minX + 8} ${maxY - minY + 8}`}
      className="h-28 w-44 shrink-0 rounded-chip border border-border bg-bg"
    >
      {panels.map((p) => (
        <rect key={p.name} x={p.x} y={p.y} width={p.w} height={p.h} fill="var(--surface)" stroke="var(--ink-2)" strokeWidth={1} />
      ))}
      {boxes.map(({ key, b }) => (
        <rect key={key} className="fade-in" x={b[0]} y={b[1]} width={b[2]} height={b[3]} fill="var(--info-tint)" stroke="var(--info)" strokeWidth={1.5} />
      ))}
    </svg>
  )
}

function ThumbPlaceholder({ Icon }: { Icon: typeof FileText }) {
  return (
    <div aria-hidden="true" className="flex h-28 w-44 shrink-0 items-center justify-center rounded-chip border border-border bg-bg text-ink-2">
      <Icon size={32} strokeWidth={1.5} />
    </div>
  )
}

type Shown = 'queued' | 'reading' | 'done' | 'error'

const STATUS: Record<Shown, { word: string; Icon: typeof CircleCheck; cls: string }> = {
  queued: { word: 'Waiting', Icon: LoaderCircle, cls: 'text-ink-2' },
  reading: { word: 'Reading…', Icon: LoaderCircle, cls: 'text-info' },
  done: { word: 'Read', Icon: CircleCheck, cls: 'text-ok' },
  error: { word: 'Could not read', Icon: CircleAlert, cls: 'text-bad' },
}

function FileCard({
  file,
  shown,
  facts,
  panels,
  onRetry,
}: {
  file: ProjectFile
  shown: Shown
  facts: Fact[]
  panels: PackPanel[]
  onRetry: () => void
}) {
  const titleId = useId()
  const st = STATUS[shown]
  const meta = FILE_META[file.type]
  return (
    <article aria-labelledby={titleId} data-file={file.id} className="flex gap-4 rounded-card border border-border bg-surface p-4">
      {file.type === 'pdf' ? <CartonThumb panels={panels} facts={facts} fileId={file.id} /> : <ThumbPlaceholder Icon={meta.Icon} />}
      <div className="min-w-0 flex-1">
        <h2 id={titleId} className="break-all text-[14px] font-semibold">
          {file.name}
        </h2>
        <p className="mt-0.5 text-[12px] text-ink-2">
          {meta.kind} · <span className="font-mono">{fileUnits(file)}</span>
        </p>
        <p className={`mt-2 flex items-center gap-1.5 text-[14px] font-medium ${st.cls}`} data-testid="file-status">
          <st.Icon size={16} aria-hidden="true" className={shown === 'reading' ? 'motion-safe:animate-spin' : ''} />
          {st.word}
          {shown !== 'error' && shown !== 'queued' && (
            <span className="text-ink">
              {' '}· <span className="font-mono">{facts.length}</span> {facts.length === 1 ? 'fact' : 'facts'} found
            </span>
          )}
        </p>

        {shown === 'error' && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="text-[13px] text-ink-2">{file.error || 'The reader stopped on this file.'} Facts from it are not included.</p>
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1 rounded-chip border border-border bg-surface px-3 py-1 text-[13px] font-medium hover:border-ink-2 focus-visible:outline-2 focus-visible:outline-info"
            >
              <RotateCcw size={14} aria-hidden="true" />
              Retry
            </button>
          </div>
        )}

        {shown === 'done' && (
          <div className="mt-3">
            <h3 className="text-[12px] font-semibold text-ink-2">Skipped, and why</h3>
            {file.skipped.length === 0 ? (
              <p className="mt-1 text-[13px] text-ink-2">Nothing skipped.</p>
            ) : (
              <ul className="mt-1 space-y-1 text-[13px]">
                {file.skipped.map((s) => (
                  <li key={s.item}>
                    <span className="font-medium">{s.item}</span>
                    <span className="text-ink-2"> — {s.reason}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {(shown === 'reading' || shown === 'queued') && (
          <div className="mt-3 space-y-2" aria-hidden="true">
            <Skeleton className="w-1/3" />
            <Skeleton className="w-3/4" />
            <Skeleton className="w-2/3" />
          </div>
        )}
      </div>
    </article>
  )
}

const STEPS = ['Uploading', 'Reading', 'Extracting', 'Checking'] as const
const STEP_MS = 4000

/** Step-based progress: the run is one blocking call, so reading, extracting and checking advance on a timer until it returns. */
function RunSteps({ run }: { run: RunState }) {
  const [tick, setTick] = useState(0)
  const running = run.phase === 'running'
  useEffect(() => {
    if (!running) return
    setTick(0)
    const t = setInterval(() => setTick((n) => Math.min(2, n + 1)), STEP_MS)
    return () => clearInterval(t)
  }, [running])
  const current = run.phase === 'uploading' ? 0 : 1 + tick
  return (
    <div role="status" aria-label="Progress" className="mt-4 rounded-card border border-border bg-surface p-4">
      <ol className="flex flex-wrap gap-x-6 gap-y-2 text-[14px]">
        {STEPS.map((label, i) => {
          const state = i < current ? 'done' : i === current ? 'current' : 'pending'
          const Icon = state === 'done' ? CircleCheck : state === 'current' ? LoaderCircle : Circle
          const cls = state === 'done' ? 'text-ok' : state === 'current' ? 'font-medium text-info' : 'text-ink-2'
          return (
            <li key={label} data-step={label.toLowerCase()} data-state={state} className={`flex items-center gap-1.5 ${cls}`}>
              <Icon size={16} aria-hidden="true" className={state === 'current' ? 'motion-safe:animate-spin' : ''} />
              {label}
              {i === 0 && run.total > 0 && (
                <span className="font-mono text-ink-2">
                  {run.uploaded + run.fileErrors.length}/{run.total}
                </span>
              )}
              <span className="sr-only">{state === 'done' ? '(done)' : state === 'current' ? '(in progress)' : '(waiting)'}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

const retryBtn =
  'inline-flex items-center gap-1 rounded-chip border border-border bg-surface px-3 py-1 text-[13px] font-medium hover:border-ink-2 focus-visible:outline-2 focus-visible:outline-info'

export function Evidence({ readMs = 2000 }: { readMs?: number }) {
  const { project, source, load, run, ingest, retryFailed, runAnalysis, reload } = useProject()
  const live = source === 'api'
  const { progress, restart } = useReadProgress(live ? 0 : readMs)
  const [notice, setNotice] = useState('')
  const [dragging, setDragging] = useState(false)
  const inputId = useId()

  const readable = project.files.filter((f) => f.status !== 'error')
  const readableIds = new Set(readable.map((f) => f.id))
  const shownFacts = project.facts.slice(0, Math.round(project.facts.length * progress))
  const busy = run.phase === 'uploading' || run.phase === 'running'
  const reading = live ? busy : progress < 1

  const openConflicts = project.conflicts.filter((c) => !c.resolution).length
  const counter = {
    facts: shownFacts.length,
    conflicts: Math.round(openConflicts * progress),
    missing: shownFacts.filter((f) => f.state === 'missing').length,
    pass: shownFacts.filter((f) => f.state === 'pass').length,
  }

  const shownOf = (f: ProjectFile): Shown => {
    if (f.status === 'error') return 'error'
    if (reading) return f.status === 'queued' && progress === 0 ? 'queued' : 'reading'
    return f.status
  }

  const failed = project.files.filter((f) => f.status === 'error')

  const receive = (files: File[]) => {
    if (files.length === 0) return
    if (live) void ingest(files)
    else fakeUpload(files.map((f) => f.name))
  }
  const fakeUpload = (names: string[]) => {
    setNotice(`Upload is not connected yet, so ${plural(names.length, 'file')} were not sent. Showing the sample files being read again.`)
    restart()
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    receive([...e.dataTransfer.files])
  }

  return (
    <div className="mx-auto max-w-[960px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[20px] font-semibold">Evidence</h1>
        <Link
          to="/facts"
          className="inline-flex items-center gap-1.5 rounded-chip bg-accent px-4 py-2 text-[14px] font-semibold text-white hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info"
        >
          Review facts
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>

      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed px-6 py-10 text-center focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-info ${
          dragging ? 'border-accent bg-accent/10' : 'border-border bg-surface hover:border-ink-2'
        }`}
      >
        <Upload size={24} aria-hidden="true" className="text-ink-2" />
        <span className="text-[16px] font-semibold">Drop your packaging files</span>
        <span className="text-[13px] text-ink-2">Dieline PDF, content spreadsheet, notes · or click to choose</span>
        <input
          id={inputId}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          className="sr-only"
          onChange={(e) => {
            receive([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
      </label>
      {notice && (
        <p role="status" className="mt-2 text-[13px] text-ink-2">
          {notice}
        </p>
      )}

      {live && busy && <RunSteps run={run} />}
      {live && !busy && run.fileErrors.length > 0 && (
        <div role="alert" className="mt-3 rounded-card border border-bad/30 bg-bad/10 p-3 text-[14px]">
          <p className="flex items-center gap-2 font-medium">
            <CircleAlert size={18} aria-hidden="true" className="shrink-0 text-bad" />
            {run.fileErrors.length === 1 ? '1 file was not uploaded' : `${run.fileErrors.length} files were not uploaded`}
          </p>
          <ul className="mt-1 space-y-0.5 pl-6">
            {run.fileErrors.map((f) => (
              <li key={f.name}>
                <span className="font-medium">{f.name}</span> — {f.reason}
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => void retryFailed()} className={`mt-2 ${retryBtn}`}>
            <RotateCcw size={14} aria-hidden="true" />
            Retry failed files
          </button>
        </div>
      )}
      {live && run.phase === 'error' && run.reason && (
        <div role="alert" className="mt-3 flex items-start gap-2 rounded-card border border-bad/30 bg-bad/10 p-3 text-[14px]">
          <CircleAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-bad" />
          <div>
            <p className="font-medium">The analysis did not finish</p>
            <p>{run.reason}</p>
            {(project.files.length > 0 || run.uploaded > 0) && (
              <button type="button" onClick={() => void runAnalysis()} className={`mt-2 ${retryBtn}`}>
                <RotateCcw size={14} aria-hidden="true" />
                Retry analysis
              </button>
            )}
          </div>
        </div>
      )}
      {live && run.phase === 'done' && (
        <p role="status" className="mt-3 flex items-center gap-1.5 text-[14px] font-medium text-ok">
          <CircleCheck size={16} aria-hidden="true" />
          Analysis finished
        </p>
      )}

      {live && load.status === 'loading' ? (
        <div className="mt-6">
          <LoadingSkeleton label="Loading files" />
        </div>
      ) : live && load.status === 'error' ? (
        <LoadError reason={load.reason} onRetry={() => void reload()} />
      ) : project.files.length === 0 ? (
        <section className="mt-6 rounded-card border border-border bg-surface p-8 text-center">
          <h2 className="text-[16px] font-semibold">No files yet</h2>
          <p className="mt-1 text-ink-2">No files yet — drop your packaging files above to start.</p>
        </section>
      ) : (
        <>
          <p aria-live="polite" data-testid="evidence-counter" className="mt-6 flex flex-wrap items-center gap-x-2 font-mono text-[14px]">
            {reading && <LoaderCircle size={14} aria-hidden="true" className="text-info motion-safe:animate-spin" />}
            <span>{plural(counter.facts, 'fact')}</span>·<span>{plural(counter.conflicts, 'conflict')}</span>·
            <span>{counter.missing} missing</span>·<span>{counter.pass} pass</span>
            {reading && <span className="font-sans text-ink-2">· Reading files…</span>}
          </p>

          {live && !busy && project.facts.length === 0 && failed.length < project.files.length && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-card border border-info/40 bg-info/10 p-3 text-[14px]">
              <p>The files are uploaded but not analysed yet.</p>
              <button
                type="button"
                onClick={() => void runAnalysis()}
                className="inline-flex items-center gap-1.5 rounded-chip bg-accent px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info"
              >
                <Play size={14} aria-hidden="true" />
                Run analysis
              </button>
            </div>
          )}

          {failed.length > 0 && (
            <div role="alert" className="mt-3 flex items-start gap-2 rounded-card border border-bad/30 bg-bad/10 p-3 text-[14px]">
              <CircleAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-bad" />
              <p>
                {failed.length === project.files.length ? (
                  <>No file could be read. Retry, or drop the files again.</>
                ) : (
                  <>
                    {readable.length} of {plural(project.files.length, 'file')} read. {failed.map((f) => f.name).join(', ')} could not be read, so the
                    facts below come only from the files that were read.
                  </>
                )}
              </p>
            </div>
          )}

          <div className="mt-4 space-y-3">
            {project.files.map((f) => (
              <FileCard
                key={f.id}
                file={f}
                shown={shownOf(f)}
                facts={readableIds.has(f.id) ? shownFacts.filter((x) => x.sources.some((s) => s.fileId === f.id)) : []}
                panels={project.pack.panels}
                onRetry={live ? () => void runAnalysis() : restart}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
