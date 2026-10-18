import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { prefersReducedMotion } from '../../lib/motion'
import { clampView, easeOut, revealBox, same, viewForBox, ZOOM_STEP, zoomAt, zoomOf, type Frame } from '../../lib/viewport'

export const TWEEN_MS = 200

export interface Viewport {
  frame: Frame
  view: Frame
  /** 1 = the whole frame fits. */
  zoom: number
  zoomBy(factor: number, at?: { fx: number; fy: number }, animate?: boolean): void
  zoomIn(): void
  zoomOut(): void
  fit(): void
  /** Move the window by screen-independent mm. */
  panBy(dx: number, dy: number): void
  zoomToBox(box: Frame, minW?: number): void
  /** Pan (not zoom) so the box is inside the window. */
  reveal(box: Frame): void
}

/**
 * Zoom and pan state: a window (viewBox) onto the frame. Wheel, drag and pinch change it directly;
 * buttons, chips and markers glide there in 200 ms unless the person prefers reduced motion.
 * The window resets to fit whenever the frame itself changes.
 */
export function useViewport(frame: Frame): Viewport {
  const frameKey = `${frame.x}|${frame.y}|${frame.w}|${frame.h}`
  const frameRef = useRef(frame)
  frameRef.current = frame
  const [view, setView] = useState<Frame>(frame)
  const viewRef = useRef<Frame>(frame)
  const raf = useRef(0)

  const commit = useCallback((v: Frame) => {
    viewRef.current = v
    setView(v)
  }, [])
  const stop = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current)
    raf.current = 0
  }, [])

  const go = useCallback(
    (to: Frame, animate: boolean) => {
      const target = clampView(to, frameRef.current)
      stop()
      const from = viewRef.current
      if (!animate || prefersReducedMotion() || typeof requestAnimationFrame !== 'function' || same(from, target)) {
        commit(target)
        return
      }
      const t0 = performance.now()
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / TWEEN_MS)
        const e = easeOut(t)
        const lerp = (p: number, q: number) => p + (q - p) * e
        commit(clampView({ x: lerp(from.x, target.x), y: lerp(from.y, target.y), w: lerp(from.w, target.w), h: 0 }, frameRef.current))
        raf.current = t < 1 ? requestAnimationFrame(step) : 0
      }
      raf.current = requestAnimationFrame(step)
    },
    [commit, stop],
  )

  useEffect(() => {
    stop()
    commit(frameRef.current)
  }, [frameKey, commit, stop])
  useEffect(() => stop, [stop])

  return useMemo<Viewport>(
    () => ({
      frame,
      view,
      zoom: zoomOf(view, frame),
      zoomBy: (factor, at, animate = false) => go(zoomAt(viewRef.current, frameRef.current, factor, at?.fx, at?.fy), animate),
      zoomIn: () => go(zoomAt(viewRef.current, frameRef.current, ZOOM_STEP), true),
      zoomOut: () => go(zoomAt(viewRef.current, frameRef.current, 1 / ZOOM_STEP), true),
      fit: () => go(frameRef.current, true),
      panBy: (dx, dy) => {
        const v = viewRef.current
        go({ ...v, x: v.x + dx, y: v.y + dy }, false)
      },
      zoomToBox: (box, minW) => go(viewForBox(frameRef.current, box, { minW }), true),
      reveal: (box) => go(revealBox(viewRef.current, frameRef.current, box), true),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, frameKey, go],
  )
}
