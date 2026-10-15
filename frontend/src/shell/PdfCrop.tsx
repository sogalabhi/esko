import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import type { BBox, PackPanel, Source } from '../types/project'

const TARGET_PX = 440
const PAD_MM = 10

/** The region of the page to show (mm): the panel, or the quote with some margin. */
function regionOf(source: Source, panels: PackPanel[]): { x: number; y: number; w: number; h: number } | null {
  const panel = panels.find((p) => p.name === source.where.panel)
  if (panel) return panel
  const b = source.where.bbox
  return b ? { x: Math.max(0, b[0] - PAD_MM), y: Math.max(0, b[1] - PAD_MM), w: b[2] + PAD_MM * 2, h: b[3] + PAD_MM * 2 } : null
}

/**
 * Renders the real panel crop from the original PDF with PDF.js and outlines the quote.
 * Calls onUnavailable when the backend has no raw-file route or the PDF cannot be drawn,
 * so the caller can show the placeholder frame instead.
 */
export function PdfCrop({ source, panels, onUnavailable }: { source: Source; panels: PackPanel[]; onUnavailable: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  const region = regionOf(source, panels)
  const bbox: BBox | undefined = source.where.bbox
  const { fileId } = source
  const page = source.where.page ?? 1
  const key = region ? `${region.x},${region.y},${region.w},${region.h}` : ''

  useEffect(() => {
    if (!region) {
      onUnavailable()
      return
    }
    let cancelled = false
    let destroy: (() => void) | undefined
    ;(async () => {
      try {
        const url = api.rawUrl(fileId)
        const head = await fetch(url, { method: 'HEAD' })
        if (!head.ok) throw new Error('no raw file')
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
        const task = pdfjs.getDocument({ url })
        destroy = () => void task.destroy()
        const doc = await task.promise
        const pg = await doc.getPage(page)
        const canvas = canvasRef.current
        const ctx = canvas?.getContext('2d')
        if (cancelled || !canvas || !ctx) return
        const dpr = window.devicePixelRatio || 1
        const pxPerMm = TARGET_PX / region.w
        const k = pxPerMm * dpr // device pixels per mm
        canvas.width = Math.ceil(region.w * k)
        canvas.height = Math.ceil(region.h * k)
        const viewport = pg.getViewport({ scale: (k * 25.4) / 72 })
        await pg.render({ canvas, canvasContext: ctx, viewport, transform: [1, 0, 0, 1, -region.x * k, -region.y * k] }).promise
        if (!cancelled) setReady(true)
      } catch {
        if (!cancelled) onUnavailable()
      }
    })()
    return () => {
      cancelled = true
      destroy?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId, page, key])

  if (!region) return null
  const pct = (v: number, base: number, size: number) => `${((v - base) / size) * 100}%`
  return (
    <figure>
      <div
        className="relative w-full max-w-[440px] overflow-hidden rounded-chip border border-border bg-bg"
        style={{ aspectRatio: `${region.w} / ${region.h}` }}
      >
        {!ready && <div aria-hidden="true" className="absolute inset-0 animate-pulse bg-border" />}
        <canvas ref={canvasRef} role="img" aria-label={`${source.where.panel ?? 'Page'} crop with the quote outlined`} className="block h-full w-full" />
        {ready && bbox && (
          <div
            data-highlight
            className="absolute border-2 border-info bg-info/15"
            style={{ left: pct(bbox[0], region.x, region.w), top: pct(bbox[1], region.y, region.h), width: `${(bbox[2] / region.w) * 100}%`, height: `${(bbox[3] / region.h) * 100}%` }}
          />
        )}
      </div>
      <figcaption className="mt-1 text-[12px] text-ink-2">
        {source.where.panel ?? 'Page'} panel from the original PDF, quote outlined
      </figcaption>
    </figure>
  )
}
