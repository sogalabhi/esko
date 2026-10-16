import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { SkippedItem } from '../../types/project'

export type CartonImage =
  | { status: 'off' }
  | { status: 'loading' }
  | { status: 'ready'; url: string; w: number; h: number }
  | { status: 'error'; reason: string }

const PT_TO_MM = 25.4 / 72
/** Pixels per mm of the rendered page: sharp on screen and good enough for an A3 print (about 150 dpi). */
const PX_PER_MM = 6

function reasonOf(e: unknown): string {
  const status = (e as { status?: number })?.status
  if (status === 404) return 'the backend does not have this file any more'
  if (e instanceof Error && e.message) return e.message
  return 'the PDF could not be drawn'
}

/**
 * Guide layers the backend ignored while reading (e.g. dimension text), named in file.skipped as
 * "guide layer 'NAME'". The contract has no field for them yet, so they are read from that wording;
 * if it changes nothing breaks, the guides are just drawn.
 */
export function guideLayers(skipped: SkippedItem[]): string[] {
  const names = new Set<string>()
  for (const s of skipped) for (const m of `${s.item} ${s.reason}`.matchAll(/guide layer '([^']+)'/g)) names.add(m[1])
  return [...names]
}

/**
 * Page 1 of the pack PDF from /api/files/{id}/raw, drawn once with PDF.js into an image (object URL)
 * plus the page size in mm, so marks in mm can sit in the same frame. `hide` names layers to switch off.
 */
export function useCartonImage(fileId: string | null, enabled: boolean, attempt = 0, hide: string[] = []): CartonImage {
  const hideKey = hide.join('|')
  const [state, setState] = useState<CartonImage>({ status: enabled && fileId ? 'loading' : 'off' })

  useEffect(() => {
    if (!enabled || !fileId) {
      setState({ status: 'off' })
      return
    }
    let cancelled = false
    let url: string | null = null
    let destroy: (() => void) | undefined
    setState({ status: 'loading' })
    ;(async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
        const task = pdfjs.getDocument({ url: api.rawUrl(fileId) })
        destroy = () => void task.destroy()
        const doc = await task.promise
        const page = await doc.getPage(1)
        // Rendering respects layers (text extraction does not): switch the guide layers off.
        const layers = await doc.getOptionalContentConfig()
        if (hideKey) for (const [id, group] of layers) if (hideKey.split('|').includes(group?.name)) layers.setVisibility(id, false)
        const base = page.getViewport({ scale: 1 })
        const w = base.width * PT_TO_MM
        const h = base.height * PT_TO_MM
        const scale = (PX_PER_MM * w) / base.width
        const viewport = page.getViewport({ scale })
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('this browser cannot draw the PDF')
        await page.render({ canvas, canvasContext: ctx, viewport, optionalContentConfigPromise: Promise.resolve(layers) }).promise
        const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
        if (!blob) throw new Error('the page image could not be made')
        if (cancelled) return
        url = URL.createObjectURL(blob)
        setState({ status: 'ready', url, w, h })
      } catch (e) {
        if (!cancelled) setState({ status: 'error', reason: reasonOf(e) })
      }
    })()
    return () => {
      cancelled = true
      destroy?.()
      if (url) URL.revokeObjectURL(url)
    }
  }, [fileId, enabled, attempt, hideKey])

  return state
}
