/** Pure zoom / pan maths for the markup canvas. A view is a window onto the frame, both in page mm. */

export interface Frame {
  x: number
  y: number
  w: number
  h: number
}

export const MAX_ZOOM = 16
export const ZOOM_STEP = 1.5

/** Keep the window inside the frame, no wider than the frame and no narrower than 1/MAX_ZOOM of it. Aspect follows the frame. */
export function clampView(v: Frame, frame: Frame): Frame {
  const w = Math.min(frame.w, Math.max(frame.w / MAX_ZOOM, v.w))
  const h = (w * frame.h) / frame.w
  const x = Math.min(frame.x + frame.w - w, Math.max(frame.x, v.x))
  const y = Math.min(frame.y + frame.h - h, Math.max(frame.y, v.y))
  return { x, y, w, h }
}

export const zoomOf = (v: Frame, frame: Frame): number => frame.w / v.w

/** Zoom by `factor` keeping the point at (fx, fy), as fractions of the window, where it is on screen. */
export function zoomAt(v: Frame, frame: Frame, factor: number, fx = 0.5, fy = 0.5): Frame {
  const w = Math.min(frame.w, Math.max(frame.w / MAX_ZOOM, v.w / factor))
  const h = (w * frame.h) / frame.w
  const px = v.x + v.w * fx
  const py = v.y + v.h * fy
  return clampView({ x: px - w * fx, y: py - h * fy, w, h }, frame)
}

/** A window that frames `box` with room around it. `minW` stops a tiny box from zooming to a blur. */
export function viewForBox(frame: Frame, box: { x: number; y: number; w: number; h: number }, opt: { pad?: number; minW?: number } = {}): Frame {
  const pad = opt.pad ?? 1.6
  const aspect = frame.w / frame.h
  const w = Math.max(opt.minW ?? 60, box.w * pad, box.h * pad * aspect)
  const h = (w * frame.h) / frame.w
  return clampView({ x: box.x + box.w / 2 - w / 2, y: box.y + box.h / 2 - h / 2, w, h }, frame)
}

/** Move the window just enough to bring `box` inside it (with a margin); unchanged when it already is. */
export function revealBox(v: Frame, frame: Frame, box: { x: number; y: number; w: number; h: number }, margin = 4): Frame {
  let { x, y } = v
  if (box.x < x + margin) x = box.x - margin
  else if (box.x + box.w > x + v.w - margin) x = box.x + box.w + margin - v.w
  if (box.y < y + margin) y = box.y - margin
  else if (box.y + box.h > y + v.h - margin) y = box.y + box.h + margin - v.h
  return clampView({ ...v, x, y }, frame)
}

export const same = (a: Frame, b: Frame): boolean => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.w - b.w) < 0.01

export const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3)
