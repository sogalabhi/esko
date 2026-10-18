import { describe, expect, it } from 'vitest'
import { clampView, MAX_ZOOM, revealBox, viewForBox, zoomAt, zoomOf } from './viewport'

const frame = { x: -10, y: 0, w: 400, h: 200 }

describe('viewport maths', () => {
  it('never leaves the frame or zooms out past fit', () => {
    const v = clampView({ x: -500, y: 900, w: 9999, h: 1 }, frame)
    expect(v).toEqual(frame)
    const z = clampView({ x: 380, y: 190, w: 100, h: 50 }, frame)
    expect(z.x + z.w).toBeLessThanOrEqual(frame.x + frame.w)
    expect(z.y + z.h).toBeLessThanOrEqual(frame.y + frame.h)
  })

  it('zooms around a point: the spot under the cursor stays put', () => {
    const v = zoomAt(frame, frame, 2, 0.25, 0.5)
    expect(zoomOf(v, frame)).toBeCloseTo(2)
    expect(v.x + v.w * 0.25).toBeCloseTo(frame.x + frame.w * 0.25)
    expect(v.y + v.h * 0.5).toBeCloseTo(frame.y + frame.h * 0.5)
  })

  it('caps the zoom and keeps the aspect of the frame', () => {
    const v = zoomAt(frame, frame, 1000)
    expect(zoomOf(v, frame)).toBe(MAX_ZOOM)
    expect(v.w / v.h).toBeCloseTo(frame.w / frame.h)
  })

  it('frames a box centred, with room, and not tighter than minW', () => {
    const v = viewForBox(frame, { x: 100, y: 50, w: 10, h: 10 }, { minW: 80 })
    expect(v.w).toBe(80)
    expect(v.x + v.w / 2).toBeCloseTo(105)
    expect(v.y + v.h / 2).toBeCloseTo(55)
  })

  it('reveals a box with the least movement', () => {
    const v = { x: 0, y: 0, w: 100, h: 50 }
    expect(revealBox(v, frame, { x: 20, y: 10, w: 5, h: 5 })).toEqual(v)
    const moved = revealBox(v, frame, { x: 150, y: 10, w: 10, h: 5 })
    expect(moved.x + moved.w).toBeGreaterThan(160)
    expect(moved.w).toBe(100)
  })
})
