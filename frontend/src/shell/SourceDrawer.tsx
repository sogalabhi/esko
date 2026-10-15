import { CircleCheck, Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { sourceLong } from '../lib/labels'
import { useProject } from '../state/project'
import type { PackPanel, Source } from '../types/project'
import { PdfCrop } from './PdfCrop'

function colIndex(col: string): number {
  return [...col].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0)
}
function colName(i: number): string {
  let s = ''
  for (let n = i; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

export function SheetPreview({ source }: { source: Source }) {
  const m = /^([A-Z]+)(\d+)$/.exec(source.where.cell ?? '')
  if (!m) return <p className="text-[13px] text-ink-2">No cell reference for this source.</p>
  const col = colIndex(m[1])
  const row = Number(m[2])
  const cols = Array.from({ length: 4 }, (_, i) => Math.max(1, col - 1) + i)
  const rows = Array.from({ length: 7 }, (_, i) => Math.max(1, row - 3) + i)
  return (
    <figure>
      <table className="w-full table-fixed border-collapse font-mono text-[11px]" aria-label={`Sheet grid around ${source.where.cell}`}>
        <thead>
          <tr>
            <th className="w-8 border border-border bg-bg" />
            {cols.map((c) => (
              <th key={c} scope="col" className="border border-border bg-bg py-0.5 font-normal text-ink-2">
                {colName(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r}>
              <th scope="row" className="border border-border bg-bg font-normal text-ink-2">
                {r}
              </th>
              {cols.map((c) => {
                const hit = c === col && r === row
                return (
                  <td
                    key={c}
                    data-target={hit || undefined}
                    className={`h-7 truncate border border-border px-1 ${hit ? 'bg-info/10 text-ink outline-2 -outline-offset-1 outline-info' : ''}`}
                  >
                    {hit ? source.quote : ''}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <figcaption className="mt-1 text-[12px] text-ink-2">
        Sheet "{source.where.sheet ?? 'Sheet 1'}" · cell <span className="font-mono">{source.where.cell}</span> outlined
      </figcaption>
    </figure>
  )
}

/** Real PDF.js crop when the backend serves the original file; otherwise the panel frame placeholder. */
export function PdfPreview({ source, panels, live = false }: { source: Source; panels: PackPanel[]; live?: boolean }) {
  const [failed, setFailed] = useState(false)
  // A new source gets a fresh try.
  const id = `${source.fileId}|${source.where.panel}|${source.where.page}|${source.where.bbox}`
  const [seen, setSeen] = useState(id)
  if (seen !== id) {
    setSeen(id)
    setFailed(false)
  }
  if (live && !failed) return <PdfCrop source={source} panels={panels} onUnavailable={() => setFailed(true)} />
  return (
    <PdfFrame
      source={source}
      panels={panels}
      note={live ? 'The original PDF is not available from the backend yet, so this shows the panel frame only.' : undefined}
    />
  )
}

export function PdfFrame({ source, panels, note }: { source: Source; panels: PackPanel[]; note?: string }) {
  const panel = panels.find((p) => p.name === source.where.panel)
  const bbox = source.where.bbox
  const frame = panel ?? (bbox ? { name: 'Page', x: bbox[0] - 10, y: bbox[1] - 10, w: bbox[2] + 20, h: bbox[3] + 20 } : null)
  if (!frame) return <p className="text-[13px] text-ink-2">No position recorded for this source.</p>
  const pad = 4
  return (
    <figure>
      <svg
        viewBox={`${frame.x - pad} ${frame.y - pad} ${frame.w + pad * 2} ${frame.h + pad * 2}`}
        className="max-h-[360px] w-full rounded-chip border border-border bg-bg"
        role="img"
        aria-label={`${frame.name} panel with the quote highlighted`}
      >
        <rect x={frame.x} y={frame.y} width={frame.w} height={frame.h} fill="var(--surface)" stroke="var(--ink-2)" strokeWidth={0.6} strokeDasharray="3 2" />
        <text x={frame.x + 3} y={frame.y + 7} fontSize={5} fill="var(--ink-2)" fontFamily="IBM Plex Sans">
          {frame.name}
        </text>
        {bbox && (
          <rect
            data-highlight
            x={bbox[0]}
            y={bbox[1]}
            width={bbox[2]}
            height={bbox[3]}
            fill="color-mix(in srgb, var(--info) 15%, transparent)"
            stroke="var(--info)"
            strokeWidth={0.8}
          />
        )}
      </svg>
      <figcaption className="mt-1 text-[12px] text-ink-2">
        {note ?? 'Panel frame with the quote position (mm). Page crop arrives with the PDF viewer.'}
      </figcaption>
    </figure>
  )
}

export function SourceDrawer() {
  const { project, drawer, closeDrawer, source } = useProject()
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!drawer) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeDrawer()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawer, closeDrawer])

  if (!drawer) return null
  const file = project.files.find((f) => f.id === drawer.fileId)

  return (
    <aside
      role="dialog"
      aria-label="Source"
      className="drawer-in fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-border bg-surface shadow-[-8px_0_24px_rgba(22,24,29,0.08)] lg:w-[480px]"
    >
      <header className="border-b border-border p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-mono text-[12px] text-ink-2">{file?.name ?? drawer.fileId}</p>
            <h2 className="mt-0.5 text-[20px] font-semibold">{sourceLong(drawer, file)}</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={closeDrawer}
            aria-label="Close source"
            className="rounded-chip p-1 text-ink-2 hover:bg-bg hover:text-ink focus-visible:outline-2 focus-visible:outline-info"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <blockquote className="mt-3 whitespace-pre-line border-l-2 border-border pl-3 text-[14px] leading-6">"{drawer.quote}"</blockquote>
        {drawer.quoteChecked ? (
          <p className="mt-2 flex items-center gap-1.5 text-[13px] font-medium text-ok">
            <CircleCheck size={15} aria-hidden="true" />
            Quote checked by code ✓
          </p>
        ) : (
          <p className="mt-2 flex items-center gap-1.5 text-[13px] font-medium text-ai">
            <Sparkles size={15} aria-hidden="true" />
            Quote not found — demoted to AI-suggested
          </p>
        )}
      </header>
      <div className="flex-1 overflow-auto p-4">
        {file?.type === 'sheet' ? <SheetPreview source={drawer} /> : <PdfPreview source={drawer} panels={project.pack.panels} live={source === 'api'} />}
      </div>
    </aside>
  )
}
