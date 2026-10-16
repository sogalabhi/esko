import { Box3, Matrix4, Quaternion, Vector3 } from 'three'
import type { DielinePanel, PackFinding, PackGeometry } from './types'

/**
 * Fold geometry for a flat dieline. Pure code, no WebGL, so it is unit-tested.
 *
 * Frames: page mm (x right, y down) maps to flat world coordinates (X = x, Y = -y, Z = 0)
 * with the printed side facing +Z. Every panel folds away from the viewer (into -Z), so
 * the printed side ends up outside. Each panel's world matrix is the product of its
 * hinges back to the root panel, so a point in page mm maps to its 3D spot and back.
 */

export type HingeKind = 'side' | 'dust' | 'lid' | 'tuck'

export interface Hinge {
  parent: string
  child: string
  /** Crease end points in flat world coordinates. */
  p1: Vector3
  /** Unit axis along the crease, oriented so a positive angle folds the child into -Z. */
  axis: Vector3
  kind: HingeKind
  /** Slice of the 0→1 fold during which this hinge turns. */
  window: [number, number]
}

export interface HingeTree {
  root: string
  /** Panels in parent-before-child order. */
  order: string[]
  hinges: Map<string, Hinge>
  panels: Map<string, DielinePanel>
  /** Panels no crease reaches; they stay flat beside the root. */
  loose: string[]
}

const WINDOWS: Record<HingeKind, [number, number]> = {
  side: [0, 0.5],
  dust: [0.45, 0.72],
  lid: [0.68, 1],
  tuck: [0.68, 1],
}

/** Target angle at fold 1. */
export const CLOSED_ANGLE = Math.PI / 2

export const flatPoint = (x: number, y: number, z = 0) => new Vector3(x, -y, z)

const centre = (p: DielinePanel) => flatPoint(p.x + p.w / 2, p.y + p.h / 2)

function pickRoot(geom: PackGeometry): string {
  if (geom.panels.some((p) => p.name === 'Front')) return 'Front'
  const degree = new Map<string, number>()
  for (const f of geom.folds) {
    degree.set(f.a, (degree.get(f.a) ?? 0) + 1)
    degree.set(f.b, (degree.get(f.b) ?? 0) + 1)
  }
  return [...geom.panels].sort((p, q) => (degree.get(q.name) ?? 0) - (degree.get(p.name) ?? 0) || q.w * q.h - p.w * p.h)[0]?.name ?? ''
}

/** Breadth-first spanning tree of the crease graph from the root panel. */
export function buildHingeTree(geom: PackGeometry, root = pickRoot(geom)): HingeTree {
  const panels = new Map(geom.panels.map((p) => [p.name, p]))
  const hinges = new Map<string, Hinge>()
  const order = [root]
  const seen = new Set([root])
  const maxWidth = Math.max(...geom.panels.map((p) => p.w))
  for (let i = 0; i < order.length; i++) {
    const parentName = order[i]
    const parent = panels.get(parentName)!
    for (const f of geom.folds) {
      const childName = f.a === parentName ? f.b : f.b === parentName ? f.a : null
      if (!childName || seen.has(childName) || !panels.has(childName)) continue
      const child = panels.get(childName)!
      const p1 = flatPoint(f.x1, f.y1)
      const axis = flatPoint(f.x2, f.y2).sub(p1).normalize()
      // Orient the axis so rotating by +angle sends the child's centre into -Z.
      const v = centre(child).sub(p1)
      if (axis.x * v.y - axis.y * v.x > 0) axis.negate()
      const horizontal = Math.abs(f.x2 - f.x1) >= Math.abs(f.y2 - f.y1)
      const parentHinge = hinges.get(parentName)
      const kind: HingeKind = !horizontal
        ? 'side'
        : parentHinge && parentHinge.kind !== 'side'
          ? 'tuck'
          : parent.w >= maxWidth * 0.75
            ? 'lid'
            : 'dust'
      hinges.set(childName, { parent: parentName, child: childName, p1, axis, kind, window: WINDOWS[kind] })
      seen.add(childName)
      order.push(childName)
    }
  }
  const loose = geom.panels.map((p) => p.name).filter((n) => !seen.has(n))
  return { root, order, hinges, panels, loose }
}

const smooth = (t: number) => t * t * (3 - 2 * t)

/** Angle of one hinge (radians) at fold progress 0→1. */
export function hingeAngle(hinge: Hinge, fold: number): number {
  const [a, b] = hinge.window
  const t = Math.min(1, Math.max(0, (fold - a) / (b - a)))
  return CLOSED_ANGLE * smooth(t)
}

/** Every hinge's angle, keyed by the child panel. */
export function hingeAngles(tree: HingeTree, fold: number): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [child, h] of tree.hinges) out[child] = hingeAngle(h, fold)
  return out
}

export interface Layout {
  /** World matrix per panel, in flat world coordinates (before centring). */
  matrices: Map<string, Matrix4>
  /** Translation that centres the model at the origin (flat sheet at 0, closed box at 1). */
  offset: Vector3
}

function panelMatrices(tree: HingeTree, fold: number): Map<string, Matrix4> {
  const out = new Map<string, Matrix4>()
  for (const name of tree.order) {
    const h = tree.hinges.get(name)
    if (!h) {
      out.set(name, new Matrix4())
      continue
    }
    const q = new Quaternion().setFromAxisAngle(h.axis, hingeAngle(h, fold))
    const local = new Matrix4()
      .makeTranslation(h.p1.x, h.p1.y, h.p1.z)
      .multiply(new Matrix4().makeRotationFromQuaternion(q))
      .multiply(new Matrix4().makeTranslation(-h.p1.x, -h.p1.y, -h.p1.z))
    out.set(name, out.get(h.parent)!.clone().multiply(local))
  }
  for (const name of tree.loose) out.set(name, new Matrix4())
  return out
}

function boundsCentre(tree: HingeTree, matrices: Map<string, Matrix4>): Vector3 {
  const box = new Box3()
  for (const [name, m] of matrices) {
    if (tree.loose.includes(name)) continue
    const p = tree.panels.get(name)!
    for (const [x, y] of [[p.x, p.y], [p.x + p.w, p.y], [p.x, p.y + p.h], [p.x + p.w, p.y + p.h]]) {
      box.expandByPoint(flatPoint(x, y).applyMatrix4(m))
    }
  }
  return box.getCenter(new Vector3())
}

/** Panel matrices at a fold value plus the centring offset. */
export function layoutAt(tree: HingeTree, fold: number): Layout {
  const matrices = panelMatrices(tree, fold)
  const flat = boundsCentre(tree, panelMatrices(tree, 0))
  const closed = boundsCentre(tree, panelMatrices(tree, 1))
  const offset = flat.lerp(closed, fold).negate()
  return { matrices, offset }
}

// ---- mm ↔ face mapping -------------------------------------------------------------

/** Page mm → normalised face coordinates (u right, v down, 0..1 across the panel). */
export function pageToFace(panel: DielinePanel, x: number, y: number): { u: number; v: number } {
  return { u: (x - panel.x) / panel.w, v: (y - panel.y) / panel.h }
}

export function faceToPage(panel: DielinePanel, u: number, v: number): { x: number; y: number } {
  return { x: panel.x + u * panel.w, y: panel.y + v * panel.h }
}

/** The rectangle of the page the artwork texture covers, in mm. */
export interface PageFrame {
  x: number
  y: number
  w: number
  h: number
}

/** Page mm → texture UV (v up, as WebGL samples it). */
export function pageToUv(frame: PageFrame, x: number, y: number): [number, number] {
  return [(x - frame.x) / frame.w, 1 - (y - frame.y) / frame.h]
}

export function uvToPage(frame: PageFrame, u: number, v: number): { x: number; y: number } {
  return { x: frame.x + u * frame.w, y: frame.y + (1 - v) * frame.h }
}

/** The page frame that holds every panel (used when no PDF page size is known). */
export function panelsFrame(panels: DielinePanel[]): PageFrame {
  const w = Math.max(...panels.map((p) => p.x + p.w))
  const h = Math.max(...panels.map((p) => p.y + p.h))
  return { x: 0, y: 0, w, h }
}

/** A page-mm point on a panel → its 3D spot (centred world), lifted `lift` mm off the face. */
export function pageToWorld(layout: Layout, panel: string, x: number, y: number, lift = 0): Vector3 {
  const m = layout.matrices.get(panel)
  if (!m) throw new Error(`unknown panel ${panel}`)
  return flatPoint(x, y, lift).applyMatrix4(m).add(layout.offset)
}

/** A 3D point on a panel's face → page mm (inverse of pageToWorld). */
export function worldToPage(layout: Layout, panel: string, point: Vector3): { x: number; y: number; lift: number } {
  const m = layout.matrices.get(panel)
  if (!m) throw new Error(`unknown panel ${panel}`)
  const local = point.clone().sub(layout.offset).applyMatrix4(m.clone().invert())
  return { x: local.x, y: -local.y, lift: local.z }
}

/** Outward normal of a panel's printed side. */
export function faceNormal(layout: Layout, panel: string): Vector3 {
  const m = layout.matrices.get(panel)
  if (!m) throw new Error(`unknown panel ${panel}`)
  return new Vector3(0, 0, 1).transformDirection(m)
}

/** Centre of a panel's face in centred world coordinates. */
export function faceCentre(layout: Layout, panel: DielinePanel): Vector3 {
  return pageToWorld(layout, panel.name, panel.x + panel.w / 2, panel.y + panel.h / 2)
}

// ---- pins ----------------------------------------------------------------------------

export interface PlacedPin {
  finding: PackFinding
  /** The face the pin sits on. */
  panel: string
}

const contains = (p: DielinePanel, x: number, y: number) => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h

/** The panel an item belongs to: the one it names, else the one under its point. */
export function panelFor(panels: DielinePanel[], name: string, x: number, y: number): DielinePanel | undefined {
  return panels.find((p) => p.name === name) ?? panels.find((p) => contains(p, x, y))
}

/**
 * One pin per finding. A finding goes on the panel it names; if that name is unknown it
 * goes on the panel containing its point; otherwise it is listed as unplaced (shown in
 * the findings list, never dropped silently).
 */
export function placePins(findings: PackFinding[], panels: DielinePanel[]): { placed: PlacedPin[]; unplaced: PackFinding[] } {
  const placed: PlacedPin[] = []
  const unplaced: PackFinding[] = []
  const seen = new Set<string>()
  for (const f of findings) {
    if (seen.has(f.id)) continue
    seen.add(f.id)
    const panel = panelFor(panels, f.panel, f.x, f.y)
    if (panel) placed.push({ finding: f, panel: panel.name })
    else unplaced.push(f)
  }
  return { placed, unplaced }
}
