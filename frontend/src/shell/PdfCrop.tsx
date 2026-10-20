import { useEffect } from 'react'
import { usePageImage } from '../lib/pageImage'
import type { BBox, PackPanel, Source } from '../types/project'

const PAD_MM = 10

/** The region of the page to show (mm): the panel, or the quote with some margin. */
function regionOf(source: Source, panels: PackPanel[]): { x: number; y: number; w: number; h: number } | null {
  const panel = panels.find((p) => p.name === source.where.panel)
  if (panel) return panel
  const b = source.where.bbox
  return b ? { x: Math.max(0, b[0] - PAD_MM), y: Math.max(0, b[1] - PAD_MM), w: b[2] + PAD_MM * 2, h: b[3] + PAD_MM * 2 } : null
}

/**
 * The panel crop from the carton page image every screen shares (one download for all crops), with the
 * quote outlined. The crop is CSS: the page image is scaled so the region fills the box, then shifted.
 * Calls onUnavailable when the backend cannot draw the page, so the caller can show the placeholder frame.
 */
export function PdfCrop({ source, panels, onUnavailable }: { source: Source; panels: PackPanel[]; onUnavailable: (reason: string) => void }) {
  const region = regionOf(source, panels)
  const bbox: BBox | undefined = source.where.bbox
  const { fileId } = source
  const page = source.where.page ?? 1
  // The backend draws page 1 only.
  const drawable = !!region && page === 1
  const img = usePageImage(fileId, drawable)
  const failure = img.status === 'error' ? img.reason : null

  useEffect(() => {
    if (!region) onUnavailable('this source has no panel or position to crop')
    else if (page !== 1) onUnavailable('only page 1 of the PDF can be drawn')
    else if (failure) onUnavailable(failure)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!region, page, failure])

  if (!region) return null
  const pct = (v: number, base: number, size: number) => `${((v - base) / size) * 100}%`
  const ready = img.status === 'ready'
  return (
    <figure>
      <div
        className="relative w-full max-w-[440px] overflow-hidden rounded-chip border border-border bg-bg"
        style={{ aspectRatio: `${region.w} / ${region.h}` }}
      >
        {!ready && (
          <div role="status" className="absolute inset-0 flex items-center justify-center bg-border">
            <span className="animate-pulse text-[12px] font-medium text-ink-2">Drawing the carton…</span>
          </div>
        )}
        {ready && (
          <img
            src={img.url}
            alt={`${source.where.panel ?? `Page ${page}`} crop with the quote outlined`}
            draggable={false}
            className="absolute max-w-none select-none"
            style={{
              width: `${(img.w / region.w) * 100}%`,
              height: `${(img.h / region.h) * 100}%`,
              left: `${(-region.x / region.w) * 100}%`,
              top: `${(-region.y / region.h) * 100}%`,
            }}
          />
        )}
        {ready && bbox && (
          <div
            data-highlight
            className="absolute border-2 border-info bg-info/15"
            style={{ left: pct(bbox[0], region.x, region.w), top: pct(bbox[1], region.y, region.h), width: `${(bbox[2] / region.w) * 100}%`, height: `${(bbox[3] / region.h) * 100}%` }}
          />
        )}
      </div>
      <figcaption className="mt-1 text-[12px] text-ink-2">
        {source.where.panel ? `${source.where.panel} panel` : `Page ${page}`} from the original PDF, quote outlined
      </figcaption>
    </figure>
  )
}
