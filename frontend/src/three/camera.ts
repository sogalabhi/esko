import { Box3, Vector3 } from 'three'
import { faceCentre, faceNormal, flatPoint, type HingeTree, type Layout } from './geometry'

export interface CameraView {
  position: Vector3
  target: Vector3
}

function bounds(tree: HingeTree, layout: Layout): Box3 {
  const box = new Box3()
  for (const [name, m] of layout.matrices) {
    const p = tree.panels.get(name)!
    for (const [x, y] of [[p.x, p.y], [p.x + p.w, p.y + p.h], [p.x + p.w, p.y], [p.x, p.y + p.h]]) {
      box.expandByPoint(flatPoint(x, y).applyMatrix4(m).add(layout.offset))
    }
  }
  return box
}

/**
 * The resting view: straight on for the flat sheet, a three-quarter view (front, right
 * side and top showing) once the box is mostly folded.
 */
export function homeView(tree: HingeTree, layout: Layout, fold: number, fovDeg = 35): CameraView {
  const box = bounds(tree, layout)
  const size = box.getSize(new Vector3())
  const target = box.getCenter(new Vector3())
  const fit = (extent: number) => extent / 2 / Math.tan(((fovDeg / 2) * Math.PI) / 180)
  if (fold < 0.5) {
    const d = fit(Math.max(size.x / 1.6, size.y)) * 1.15
    return { position: target.clone().add(new Vector3(0, 0, d)), target }
  }
  const d = fit(size.length()) * 1.05
  const dir = new Vector3(0.55, 0.45, 1).normalize()
  return { position: target.clone().add(dir.multiplyScalar(d)), target }
}

/** Fly-to view: square on to a face, slightly from above, far enough to see the whole face. */
export function faceView(tree: HingeTree, layout: Layout, panelName: string, fovDeg = 35): CameraView {
  const panel = tree.panels.get(panelName)
  if (!panel) throw new Error(`unknown panel ${panelName}`)
  const target = faceCentre(layout, panel)
  const n = faceNormal(layout, panelName)
  const fit = Math.max(panel.w, panel.h) / 2 / Math.tan(((fovDeg / 2) * Math.PI) / 180)
  const d = Math.max(fit * 1.5, 180)
  const tilt = Math.abs(n.y) > 0.9 ? new Vector3(0, 0, 0.35) : new Vector3(0, 0.25, 0)
  const dir = n.clone().add(tilt).normalize()
  return { position: target.clone().add(dir.multiplyScalar(d)), target }
}
