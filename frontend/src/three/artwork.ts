import { useEffect, useMemo, useState } from 'react'
import { CanvasTexture, SRGBColorSpace, Texture } from 'three'
import { loadPageImage, pageImageReason } from '../lib/pageImage'
import { panelsFrame, type PageFrame } from './geometry'
import type { DielinePanel, PackArtwork } from './types'

/** Texture resolution: pixels per page mm, capped so the canvas stays inside GPU limits. */
const PX_PER_MM = 5
const MAX_PX = 4096

export type ArtworkStatus = 'loading' | 'pdf' | 'fallback'

export interface ArtworkTexture {
  texture: Texture | null
  /** The page rectangle (mm) the texture covers, for UV mapping. */
  frame: PageFrame
  status: ArtworkStatus
  /** Plain reason when the PDF could not be drawn. */
  reason?: string
}

function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

function canvas2d(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  let ctx: CanvasRenderingContext2D | null = null
  try {
    ctx = canvas.getContext('2d')
  } catch {
    ctx = null
  }
  return ctx ? { canvas, ctx } : null
}

/** Flat colours and panel names on the same page frame, so the UV path is identical. */
export function drawFallback(panels: DielinePanel[], frame: PageFrame): HTMLCanvasElement | null {
  const k = Math.min(PX_PER_MM, MAX_PX / Math.max(frame.w, frame.h))
  const c = canvas2d(Math.ceil(frame.w * k), Math.ceil(frame.h * k))
  if (!c) return null
  const { canvas, ctx } = c
  const surface = cssVar('--surface', '#ffffff')
  const bg = cssVar('--bg', '#fafaf7')
  const border = cssVar('--border', '#e4e4de')
  const ink2 = cssVar('--ink-2', '#5b6170')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const mainArea = Math.max(...panels.map((p) => p.w * p.h))
  for (const p of panels) {
    const x = (p.x - frame.x) * k
    const y = (p.y - frame.y) * k
    ctx.fillStyle = p.w * p.h > mainArea * 0.4 ? surface : bg
    ctx.fillRect(x, y, p.w * k, p.h * k)
    ctx.strokeStyle = border
    ctx.lineWidth = 2
    ctx.strokeRect(x + 1, y + 1, p.w * k - 2, p.h * k - 2)
    ctx.fillStyle = ink2
    const size = Math.max(10, Math.min(p.w, p.h) * k * 0.09)
    ctx.font = `500 ${size}px "IBM Plex Sans", system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(p.name, x + (p.w * k) / 2, y + (p.h * k) / 2, p.w * k * 0.9)
  }
  return canvas
}

function toTexture(canvas: HTMLCanvasElement): Texture {
  const t = new CanvasTexture(canvas)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** The page image every screen shares (guide layers already off), as a decoded image plus the page size in mm. */
async function loadPageTexture(fileId: string, page: number, signal: { cancelled: boolean }): Promise<{ texture: Texture; frame: PageFrame }> {
  // The backend draws page 1 only.
  if (page !== 1) throw new Error('only page 1 of the carton PDF can be drawn')
  const { url, w, h } = await loadPageImage(fileId)
  const img = new Image()
  img.src = url
  await img.decode()
  if (signal.cancelled) throw new Error('cancelled')
  const t = new Texture(img)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  t.needsUpdate = true
  return { texture: t, frame: { x: 0, y: 0, w, h } }
}

/**
 * The carton artwork as one texture for every face. Starts on the flat-colour fallback,
 * then swaps in the PDF page when it has been drawn. Each face crops it through its UVs.
 */
export function useArtwork(panels: DielinePanel[], artwork?: PackArtwork): ArtworkTexture {
  const fallbackFrame = useMemo(() => panelsFrame(panels), [panels])
  const fallback = useMemo(() => {
    const canvas = drawFallback(panels, fallbackFrame)
    return canvas ? toTexture(canvas) : null
  }, [panels, fallbackFrame])
  const [pdf, setPdf] = useState<{ key: string; texture: Texture; frame: PageFrame } | { key: string; reason: string } | null>(null)
  const key = artwork ? `${artwork.fileId}#${artwork.page ?? 1}` : ''

  useEffect(() => {
    if (!artwork) return
    const signal = { cancelled: false }
    loadPageTexture(artwork.fileId, artwork.page ?? 1, signal)
      .then(({ texture, frame }) => {
        if (signal.cancelled) texture.dispose()
        else setPdf({ key, texture, frame })
      })
      .catch((e: unknown) => {
        if (!signal.cancelled) setPdf({ key, reason: pageImageReason(e) })
      })
    return () => {
      signal.cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => () => fallback?.dispose(), [fallback])
  useEffect(() => () => void (pdf && 'texture' in pdf && pdf.texture.dispose()), [pdf])

  const current = pdf && pdf.key === key ? pdf : null
  if (current && 'texture' in current) return { texture: current.texture, frame: current.frame, status: 'pdf' }
  if (artwork && !current) return { texture: fallback, frame: fallbackFrame, status: 'loading' }
  return { texture: fallback, frame: fallbackFrame, status: 'fallback', reason: current && 'reason' in current ? current.reason : undefined }
}
