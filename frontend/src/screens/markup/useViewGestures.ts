import { useEffect, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import type { Viewport } from './useViewport'

interface Pt {
  x: number
  y: number
}

/** A press that moves less than this (px) is still a click on a mark, not a pan. */
const DRAG_SLOP = 5

/**
 * Wheel / trackpad-pinch zoom around the cursor, drag to pan, two-finger pinch and pan,
 * double-click or double-tap to zoom in. Pointer events, so mouse, pen and touch share one path.
 */
export function useViewGestures(wrap: RefObject<HTMLDivElement | null>, viewport: Viewport | undefined) {
  const vpRef = useRef(viewport)
  vpRef.current = viewport
  const pts = useRef(new Map<number, Pt>())
  const g = useRef({ start: { x: 0, y: 0 }, moved: false, dragged: false, pinch: 1, lastTap: { t: 0, x: 0, y: 0 } })
  const live = !!viewport

  useEffect(() => {
    const el = wrap.current
    if (!el || !live) return
    const onWheel = (e: WheelEvent) => {
      const vp = vpRef.current
      if (!vp) return
      // At fit, scrolling down belongs to the page.
      if (!e.ctrlKey && vp.zoom <= 1.001 && e.deltaY > 0) return
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const fx = r.width ? (e.clientX - r.left) / r.width : 0.5
      const fy = r.height ? (e.clientY - r.top) / r.height : 0.5
      const lines = e.deltaMode === 1 ? 16 : 1
      vp.zoomBy(Math.exp(-e.deltaY * lines * (e.ctrlKey ? 0.01 : 0.0018)), { fx, fy })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [wrap, live])

  const frac = (p: Pt) => {
    const r = wrap.current?.getBoundingClientRect()
    return { fx: r?.width ? (p.x - r.left) / r.width : 0.5, fy: r?.height ? (p.y - r.top) / r.height : 0.5 }
  }
  const mmPerPx = () => {
    const vp = vpRef.current
    const w = wrap.current?.getBoundingClientRect().width
    return vp && w ? vp.view.w / w : 0
  }

  return {
    onPointerDown(e: ReactPointerEvent) {
      if (!vpRef.current || (e.pointerType === 'mouse' && e.button !== 0)) return
      pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      g.current.start = { x: e.clientX, y: e.clientY }
      g.current.moved = pts.current.size > 1
      g.current.dragged = false
      if (pts.current.size === 2) {
        const [a, b] = [...pts.current.values()]
        g.current.pinch = Math.hypot(a.x - b.x, a.y - b.y) || 1
      }
    },
    onPointerMove(e: ReactPointerEvent) {
      const vp = vpRef.current
      const prev = pts.current.get(e.pointerId)
      if (!vp || !prev) return
      const now = { x: e.clientX, y: e.clientY }
      pts.current.set(e.pointerId, now)
      const el = e.currentTarget as HTMLElement
      if (pts.current.size >= 2) {
        const [a, b] = [...pts.current.values()]
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        vp.zoomBy(dist / g.current.pinch, frac(mid))
        g.current.pinch = dist
        // Both fingers moving the same way drag the page with them.
        const k = mmPerPx()
        vp.panBy(-((now.x - prev.x) / 2) * k, -((now.y - prev.y) / 2) * k)
        g.current.dragged = true
        return
      }
      if (!g.current.moved) {
        if (Math.hypot(now.x - g.current.start.x, now.y - g.current.start.y) < DRAG_SLOP) return
        g.current.moved = true
        try {
          el.setPointerCapture(e.pointerId)
        } catch {
          /* not capturable: dragging still works while the pointer stays over the canvas */
        }
        el.dataset.panning = ''
      }
      g.current.dragged = true
      const k = mmPerPx()
      vp.panBy(-(now.x - prev.x) * k, -(now.y - prev.y) * k)
    },
    onPointerUp(e: ReactPointerEvent) {
      const vp = vpRef.current
      pts.current.delete(e.pointerId)
      const el = e.currentTarget as HTMLElement
      if (pts.current.size === 0) delete el.dataset.panning
      if (!vp || g.current.dragged || e.pointerType !== 'touch') return
      // Double tap zooms in (not on a mark: that tap belongs to the mark).
      const t = performance.now()
      const last = g.current.lastTap
      if (t - last.t < 320 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 24 && !(e.target as Element).closest('[data-mark],[data-pass]')) {
        vp.zoomBy(2, frac({ x: e.clientX, y: e.clientY }), true)
        g.current.lastTap = { t: 0, x: 0, y: 0 }
      } else g.current.lastTap = { t, x: e.clientX, y: e.clientY }
    },
    /** A drag that ends over a mark must not click it. */
    onClickCapture(e: ReactMouseEvent) {
      if (g.current.dragged) {
        e.stopPropagation()
        e.preventDefault()
        g.current.dragged = false
      }
    },
    onDoubleClick(e: ReactMouseEvent) {
      const vp = vpRef.current
      if (!vp || (e.target as Element).closest('[data-mark],[data-pass]')) return
      vp.zoomBy(2, frac({ x: e.clientX, y: e.clientY }), true)
    },
  }
}
