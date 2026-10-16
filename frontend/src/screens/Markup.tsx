import { CircleAlert, CircleCheck, Eye, EyeOff, FileUp, GitCompareArrows, Printer, RotateCcw, StickyNote } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ConflictCard } from '../components/ConflictCard'
import { Skeleton } from '../components/LoadGate'
import { OWNER_LABEL } from '../lib/labels'
import { prefersReducedMotion } from '../lib/motion'
import { buildMarks, isOpenFinding, packFileId, type Mark, type PassTick, type Spot } from '../lib/markup'
import { buildTrackChanges } from '../lib/trackChanges'
import { useProject } from '../state/project'
import type { BBox, Project } from '../types/project'
import { MarkupCanvas, type Page } from './markup/MarkupCanvas'
import { Poster } from './markup/Poster'
import { TrackChanges } from './markup/TrackChanges'
import { guideLayers, useCartonImage } from './markup/useCartonImage'
import './markup/markup.css'

const btn =
  'inline-flex items-center gap-1.5 rounded-chip border border-border bg-surface px-3 py-1.5 text-[13px] font-medium text-ink hover:border-ink-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-info'
const pressed = 'aria-pressed:border-accent aria-pressed:bg-accent/10 aria-pressed:text-accent'

/** Page size when the PDF is not drawn: the extent of everything placed on the pack (mm). */
function fallbackPage(project: Project, fileId: string | null): Page {
  let w = 0
  let h = 0
  const grow = (x: number, y: number, bw: number, bh: number) => {
    w = Math.max(w, x + bw)
    h = Math.max(h, y + bh)
  }
  project.pack.panels.forEach((p) => grow(p.x, p.y, p.w, p.h))
  project.conflicts.forEach((c) => c.locations.forEach((l) => l.fileId === fileId && grow(l.x, l.y, l.w, l.h)))
  project.facts.forEach((f) => f.sources.forEach((s) => s.fileId === fileId && s.where.bbox && grow(...s.where.bbox)))
  return { w: Math.ceil(w + 4) || 420, h: Math.ceil(h + 4) || 297 }
}

/** Print only the poster: mark <body> while the print dialog is open. */
export function printPoster() {
  const body = document.body
  body.classList.add('bf-printing')
  const done = () => {
    body.classList.remove('bf-printing')
    window.removeEventListener('afterprint', done)
  }
  window.addEventListener('afterprint', done)
  try {
    window.print()
  } finally {
    // Browsers that return from print() only after the dialog closes never fire afterprint late.
    setTimeout(done, 0)
  }
}

export function Markup() {
  const { project, source, openSource, resolveConflict, answerError } = useProject()
  const [marked, setMarked] = useState(true)
  const [sticky, setSticky] = useState(false)
  const [track, setTrack] = useState(false)
  const [replay, setReplay] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLElement>(null)
  const findingRef = useRef<HTMLElement>(null)

  const packId = packFileId(project)
  const packFile = project.files.find((f) => f.id === packId)
  const mockMode = source === 'mock'
  const hide = useMemo(() => guideLayers(packFile?.skipped ?? []), [packFile])
  const img = useCartonImage(packId, !mockMode && !!packId, attempt, hide)
  const set = useMemo(() => buildMarks(project, packId ?? '', mockMode), [project, packId, mockMode])
  const sections = useMemo(() => (packId ? buildTrackChanges(project, packId) : []), [project, packId])
  const refFile = useMemo(() => {
    const ids = sections.flatMap((s) => s.rows.flatMap((r) => r.newSources.map((x) => x.fileId)))
    return project.files.find((f) => f.id === ids[0])
  }, [sections, project.files])
  const page: Page = img.status === 'ready' ? { w: img.w, h: img.h } : fallbackPage(project, packId)
  const hints: BBox[] = useMemo(
    () => project.facts.flatMap((f) => f.sources.filter((s) => s.fileId === packId && s.where.bbox).map((s) => s.where.bbox as BBox)),
    [project.facts, packId],
  )
  const settled = project.conflicts.filter((c) => c.resolution)
  const selectedConflict = project.conflicts.find((c) => c.id === selected)
  const selectedMark = set.marks.find((m) => m.conflict.id === selected)

  const onSelect = useCallback(
    (mark: Mark, spot: Spot) => {
      setSelected(mark.conflict.id)
      if (spot.source) openSource(spot.source)
    },
    [openSource],
  )
  const onPass = useCallback((t: PassTick) => openSource(t.source), [openSource])

  useEffect(() => {
    if (track) trackRef.current?.scrollIntoView?.({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
  }, [track])

  // J / K move between marks (UI.md §8), in finding order.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const k = e.key.toLowerCase()
      if (k !== 'j' && k !== 'k') return
      const root = canvasRef.current
      if (!root) return
      const btns = [...root.querySelectorAll<SVGGElement>('[data-mark] > [role="button"]')].sort(
        (a, b) => Number(a.parentElement?.getAttribute('data-n')) - Number(b.parentElement?.getAttribute('data-n')),
      )
      if (!btns.length) return
      e.preventDefault()
      const i = btns.indexOf(document.activeElement as SVGGElement)
      const next = k === 'j' ? (i + 1) % btns.length : (i <= 0 ? btns.length : i) - 1
      btns[next].focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!packId) {
    return (
      <section className="mx-auto mt-16 max-w-md rounded-card border border-border bg-surface p-8 text-center">
        <FileUp size={24} aria-hidden="true" className="mx-auto text-ink-2" />
        <h1 className="mt-3 text-[20px] font-semibold">No carton PDF yet</h1>
        <p className="mt-1 text-ink-2">The markup is drawn on the pack dieline. Add the carton PDF first.</p>
        <Link to="/evidence" className={`${btn} mt-4`}>
          Go to Evidence
        </Link>
      </section>
    )
  }

  const open = set.marks.length + set.offPack.length
  const resolvedNow = project.conflicts.filter((c) => !isOpenFinding(c, project.questions, mockMode)).length
  const canvasLabel = `Carton markup: ${set.marks.length} open finding${set.marks.length === 1 ? '' : 's'} marked`

  return (
    <section aria-labelledby="markup-title" className="mx-auto max-w-[1400px] space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="markup-title" className="text-[20px] font-semibold">
            Markup
          </h1>
          <p className="text-[14px] text-ink-2">The carton marked up like a senior reviewer did it. Every mark opens its sources.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Markup controls">
          <div role="group" aria-label="View" className="inline-flex overflow-hidden rounded-chip border border-border">
            <button type="button" aria-pressed={!marked} onClick={() => setMarked(false)} className={`${btn} rounded-none border-0 ${pressed}`}>
              <EyeOff size={15} aria-hidden="true" />
              Clean
            </button>
            <button
              type="button"
              aria-pressed={marked}
              onClick={() => {
                if (!marked) setReplay((r) => r + 1)
                setMarked(true)
              }}
              className={`${btn} rounded-none border-0 border-l border-border ${pressed}`}
            >
              <Eye size={15} aria-hidden="true" />
              Marked
            </button>
          </div>
          <button type="button" aria-pressed={sticky} onClick={() => setSticky((s) => !s)} className={`${btn} ${pressed}`}>
            <StickyNote size={15} aria-hidden="true" />
            Sticky notes by owner
          </button>
          <button type="button" aria-pressed={track} aria-controls={track ? 'track-panel' : undefined} onClick={() => setTrack((s) => !s)} className={`${btn} ${pressed}`}>
            <GitCompareArrows size={15} aria-hidden="true" />
            Track changes
          </button>
          {marked && (
            <button type="button" onClick={() => setReplay((r) => r + 1)} className={btn}>
              <RotateCcw size={15} aria-hidden="true" />
              Draw again
            </button>
          )}
          <button type="button" onClick={printPoster} className={btn}>
            <Printer size={15} aria-hidden="true" />
            Export A3 poster
          </button>
        </div>
      </header>

      <p role="status" aria-live="polite" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
        <span className="inline-flex items-center gap-1.5">
          <CircleAlert size={15} aria-hidden="true" className="text-bad" />
          <span className="font-mono">{open}</span> open finding{open === 1 ? '' : 's'}
          {set.offPack.length > 0 && <span className="text-ink-2">({set.offPack.length} not on the carton)</span>}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CircleCheck size={15} aria-hidden="true" className="text-ok" />
          <span className="font-mono">{resolvedNow}</span> resolved
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CircleCheck size={15} aria-hidden="true" className="text-ok" />
          <span className="font-mono">{set.passes.length}</span> check{set.passes.length === 1 ? '' : 's'} passed
        </span>
      </p>

      {answerError && (
        <p role="alert" className="flex items-start gap-1.5 rounded-chip border border-bad/30 bg-bad/10 px-3 py-2 text-[13px]">
          <CircleAlert size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-bad" />
          {answerError}
        </p>
      )}

      {img.status === 'error' && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-chip border border-warn/40 bg-warn/10 px-3 py-2 text-[13px]">
          <CircleAlert size={15} aria-hidden="true" className="shrink-0 text-warn" />
          <span className="flex-1">The carton PDF could not be drawn: {img.reason}. Showing the panel outlines instead; the marks are in the same places.</span>
          <button type="button" onClick={() => setAttempt((a) => a + 1)} className={btn}>
            <RotateCcw size={14} aria-hidden="true" />
            Retry
          </button>
        </div>
      )}

      {marked && (
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-2">
          <span>Numbers match the notes.</span>
          <span>Circle: problem at this spot</span>
          <span>Struck: take off, or wrong value</span>
          <span>Written above: value computed by code</span>
          <span>Green tick “pass”: check passed</span>
          {sticky &&
            (['legal', 'rnd', 'brand'] as const).map((o) => (
              <span key={o} className="rounded-[4px] border border-border px-1.5 text-ink" style={{ background: `var(--owner-${o})` }}>
                {OWNER_LABEL[o]}
              </span>
            ))}
        </p>
      )}

      <figure ref={canvasRef} className="overflow-hidden rounded-card border border-border bg-surface">
        {img.status === 'loading' ? (
          <div role="status" aria-label="Drawing the carton from the PDF" className="relative w-full" style={{ aspectRatio: `${page.w + 168} / ${page.h}` }}>
            <span className="sr-only">Drawing the carton from the PDF…</span>
            <Skeleton className="absolute inset-[5%_14%] h-auto rounded-card" />
          </div>
        ) : (
          <MarkupCanvas
            key={`${marked}-${replay}`}
            page={page}
            image={img.status === 'ready' ? img.url : null}
            panels={project.pack.panels}
            hints={hints}
            set={set}
            marked={marked}
            sticky={sticky}
            animate
            selectedId={selected}
            onSelect={onSelect}
            onPass={onPass}
            label={canvasLabel}
          />
        )}
        <figcaption className="border-t border-border px-3 py-2 text-[12px] text-ink-2">
          {img.status === 'ready'
            ? `${packFile?.name ?? 'Carton'} · page 1, positions in mm`
            : 'Panel outlines and text positions in mm. The carton PDF itself is drawn when connected to the backend.'}
        </figcaption>
      </figure>

      {set.marks.length === 0 && set.offPack.length === 0 && (
        <p className="flex items-center gap-1.5 rounded-chip border border-border bg-surface px-3 py-2 text-[13px]">
          <CircleCheck size={15} aria-hidden="true" className="text-ok" />
          Nothing to mark: every finding on this carton is resolved.
        </p>
      )}

      {set.offPack.length > 0 && (
        <section aria-labelledby="offpack-title" className="rounded-card border border-border bg-surface p-4">
          <h2 id="offpack-title" className="text-[14px] font-semibold">
            Open findings with no spot on the carton
          </h2>
          <ul className="mt-2 space-y-1 text-[13px]">
            {set.offPack.map((c) => (
              <li key={c.id}>
                <button type="button" className="text-left underline decoration-border underline-offset-2 hover:decoration-ink-2 focus-visible:outline-2 focus-visible:outline-info" onClick={() => setSelected(c.id)}>
                  {c.explanation}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {selectedConflict && (
        <section ref={findingRef} aria-labelledby="finding-title" className="space-y-2">
          <h2 id="finding-title" className="text-[14px] font-semibold">
            {selectedMark ? `Finding ${selectedMark.n}` : 'Finding'} · {OWNER_LABEL[selectedConflict.owner]}
          </h2>
          <ConflictCard conflict={selectedConflict} onResolve={(choice) => void resolveConflict(selectedConflict.id, choice)} />
        </section>
      )}

      {track && (
        <div id="track-panel">
          <TrackChanges ref={trackRef} sections={sections} pack={packFile} reference={refFile} />
        </div>
      )}

      <Poster project={project} set={set} page={page} image={img.status === 'ready' ? img.url : null} panels={project.pack.panels} hints={hints} sticky={sticky} settled={settled} />
    </section>
  )
}
