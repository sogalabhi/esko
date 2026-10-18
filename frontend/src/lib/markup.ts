import { clusterFindings, clusterName, clusterNote, type Box, type Cluster, type ClusterItem, type ClusterRegion } from './clusters'
import { fileShort } from './labels'
import type { BBox, Conflict, ConflictLocation, Fact, Owner, Project, Question, Source } from '../types/project'

/* ---------- seeded hand-drawn geometry (deterministic: same finding, same wobble) ---------- */

export function hashSeed(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** mulberry32: a small seeded PRNG returning [0, 1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Pt = [number, number]
const f2 = (v: number) => Math.round(v * 100) / 100

/** Smooth path through points (Catmull-Rom as cubic Béziers). */
function smooth(pts: Pt[]): string {
  if (pts.length < 2) return ''
  let d = `M${f2(pts[0][0])} ${f2(pts[0][1])}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${f2(c1[0])} ${f2(c1[1])} ${f2(c2[0])} ${f2(c2[1])} ${f2(p2[0])} ${f2(p2[1])}`
  }
  return d
}

/** A hand-drawn loop: slightly uneven radius, and the pen overshoots its start like a real circle. */
export function wobblyEllipse(cx: number, cy: number, rx: number, ry: number, seed: number): string {
  const r = rng(seed)
  const start = r() * Math.PI * 2
  const sweep = Math.PI * 2 + 0.35 + r() * 0.3
  const steps = 18
  const ph1 = r() * Math.PI * 2
  const ph2 = r() * Math.PI * 2
  const amp = 0.05 + r() * 0.04
  const tilt = (r() - 0.5) * 0.08
  const pts: Pt[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const a = start + sweep * t
    // the radius drifts low-frequency, and spirals out a little so the ends do not meet exactly
    const k = 1 + amp * Math.sin(2 * a + ph1) + amp * 0.6 * Math.sin(3 * a + ph2) + 0.06 * t
    const ex = Math.cos(a) * rx * k
    const ey = Math.sin(a) * ry * k
    pts.push([cx + ex * Math.cos(tilt) - ey * Math.sin(tilt), cy + ex * Math.sin(tilt) + ey * Math.cos(tilt)])
  }
  return smooth(pts)
}

/** A quick pen stroke between two points with a slight bow and tremor. */
export function wobblyLine(x1: number, y1: number, x2: number, y2: number, seed: number): string {
  const r = rng(seed)
  const len = Math.hypot(x2 - x1, y2 - y1) || 1
  const nx = -(y2 - y1) / len
  const ny = (x2 - x1) / len
  const bow = (r() - 0.5) * Math.min(2, len * 0.04)
  const steps = Math.max(3, Math.min(8, Math.round(len / 8)))
  const pts: Pt[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const off = bow * Math.sin(Math.PI * t) + (i > 0 && i < steps ? (r() - 0.5) * 0.35 : 0)
    pts.push([x1 + (x2 - x1) * t + nx * off, y1 + (y2 - y1) * t + ny * off])
  }
  return smooth(pts)
}

/** A curved arrow from a mark to its note: [shaft, head]. */
export function wobblyArrow(from: Pt, to: Pt, seed: number): [string, string] {
  const r = rng(seed)
  const [x1, y1] = from
  const [x2, y2] = to
  const len = Math.hypot(x2 - x1, y2 - y1) || 1
  const bend = (r() < 0.5 ? -1 : 1) * len * (0.08 + r() * 0.08)
  const cx = (x1 + x2) / 2 - ((y2 - y1) / len) * bend
  const cy = (y1 + y2) / 2 + ((x2 - x1) / len) * bend
  const shaft = `M${f2(x1)} ${f2(y1)} Q${f2(cx)} ${f2(cy)} ${f2(x2)} ${f2(y2)}`
  const ang = Math.atan2(y2 - cy, x2 - cx)
  const hl = 2.8
  const spread = 0.45 + r() * 0.12
  const a1: Pt = [x2 - hl * Math.cos(ang - spread), y2 - hl * Math.sin(ang - spread)]
  const a2: Pt = [x2 - hl * Math.cos(ang + spread), y2 - hl * Math.sin(ang + spread)]
  const head = `M${f2(a1[0])} ${f2(a1[1])} L${f2(x2)} ${f2(y2)} L${f2(a2[0])} ${f2(a2[1])}`
  return [shaft, head]
}

/** A pen tick of about `size` mm with its corner at (x, y). */
export function wobblyTick(x: number, y: number, size: number, seed: number): string {
  const r = rng(seed)
  const j = () => (r() - 0.5) * size * 0.08
  const a: Pt = [x - size * 0.45 + j(), y - size * 0.4 + j()]
  const b: Pt = [x + j(), y + j()]
  const c: Pt = [x + size * 0.7 + j(), y - size * 1.0 + j()]
  return smooth([a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.2], b, [(b[0] + c[0]) / 2 - 0.3, (b[1] + c[1]) / 2], c])
}

/**
 * A hand-drawn rounded box: the pen goes round clockwise with a slight tremor and overshoots its start,
 * so the corners round off the way a quick pen box does.
 */
export function wobblyRect(x: number, y: number, w: number, h: number, seed: number): string {
  const r = rng(seed)
  const c = Math.min(4, w / 4, h / 4)
  const j = () => (r() - 0.5) * 0.7
  const corners: Pt[] = [
    [x + c, y],
    [x + w - c, y],
    [x + w - c * 0.3, y + c * 0.3],
    [x + w, y + c],
    [x + w, y + h - c],
    [x + w - c * 0.3, y + h - c * 0.3],
    [x + w - c, y + h],
    [x + c, y + h],
    [x + c * 0.3, y + h - c * 0.3],
    [x, y + h - c],
    [x, y + c],
    [x + c * 0.3, y + c * 0.3],
  ]
  const pts: Pt[] = []
  corners.forEach((p, i) => {
    const q = corners[(i + 1) % corners.length]
    const steps = Math.max(1, Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]) / 14))
    for (let k = 0; k < steps; k++) {
      const t = k / steps
      pts.push([p[0] + (q[0] - p[0]) * t + j(), p[1] + (q[1] - p[1]) * t + j()])
    }
  })
  // Overshoot past the start along the top edge.
  pts.push([x + c + Math.min(8, w * 0.15), y - 0.6 + j() * 0.5])
  return smooth(pts)
}

/** Where a ray from a box's centre toward (tx, ty) leaves the box, `pad` mm further out. */
export function boxEdgeToward(b: Box, tx: number, ty: number, pad = 0.8): [number, number] {
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  const dx = tx - cx
  const dy = ty - cy
  const t = Math.min(dx ? (b.w / 2 + pad) / Math.abs(dx) : Infinity, dy ? (b.h / 2 + pad) / Math.abs(dy) : Infinity)
  return Number.isFinite(t) ? [cx + dx * t, cy + dy * t] : [cx, cy]
}

/* ---------- findings to marks ---------- */

export type SpotStyle = 'circle' | 'strike' | 'correct'

export interface Spot {
  x: number
  y: number
  w: number
  h: number
  /** Index of this location within its finding. */
  index: number
  style: SpotStyle
  /** How many earlier rings are drawn around the same place: each goes a ring further out. */
  ring: number
  /** How many earlier marks of any kind sit on the same place (spreads the number tags). */
  tag: number
  /**
   * A finding's extra spot on a place another finding already circled: only its number is written there,
   * so one block of text does not collect a pile of rings.
   */
  quiet: boolean
  /** What the drawer shows for this spot. */
  source?: Source
}

export interface Mark {
  conflict: Conflict
  /** Stable number for the finding on this file (does not change when others are resolved). */
  n: number
  owner: Owner
  spots: Spot[]
  /** Short margin note in the reviewer's words. */
  note: string
  /** Corrected value written above a wrong printed one. */
  correction?: string
}

export interface PassTick {
  fact: Fact
  source: Source
  bbox: BBox
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.6
const sameBox = (b: BBox | undefined, l: { x: number; y: number; w: number; h: number }) =>
  !!b && near(b[0], l.x) && near(b[1], l.y) && near(b[2], l.w) && near(b[3], l.h)

/**
 * A finding still shown on the pack: no resolution. In mock mode an answered question whose facts are all
 * part of the finding also settles it (the backend does this itself when it records the answer).
 */
export function isOpenFinding(c: Conflict, questions: Question[], mockMode: boolean): boolean {
  if (c.resolution) return false
  if (!mockMode) return true
  return !questions.some((q) => q.status === 'answered' && q.factIds.length > 0 && q.factIds.every((id) => c.factIds.includes(id)))
}

/** The PDF file most findings point at: the pack the markup is drawn on. */
export function packFileId(project: Project): string | null {
  const pdfs = new Set(project.files.filter((f) => f.type === 'pdf').map((f) => f.id))
  const tally = new Map<string, number>()
  for (const c of project.conflicts) for (const l of c.locations) if (pdfs.has(l.fileId)) tally.set(l.fileId, (tally.get(l.fileId) ?? 0) + 1)
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  return top ?? project.files.find((f) => f.type === 'pdf')?.id ?? null
}

/** Drop a trailing "(working)" and a leading "correct"/"computed" from a computed value. */
export function shortCorrection(v: string): string {
  return v
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/^(correct|computed)\s+/i, '')
    .trim()
}

function sourceFor(c: Conflict, loc: ConflictLocation, facts: Fact[]): Source | undefined {
  const sides = [...c.left.sources, ...c.right.sources]
  const own = facts.filter((f) => c.factIds.includes(f.id)).flatMap((f) => f.sources)
  return (
    sides.find((s) => s.fileId === loc.fileId && sameBox(s.where.bbox, loc)) ??
    own.find((s) => s.fileId === loc.fileId && sameBox(s.where.bbox, loc)) ??
    sides.find((s) => s.fileId === loc.fileId) ??
    sides[0] ??
    own[0]
  )
}

function styleFor(c: Conflict, loc: ConflictLocation, index: number, facts: Fact[]): SpotStyle {
  if (c.kind === 'math' && index === 0 && c.left.sources.some((s) => sameBox(s.where.bbox, loc))) return 'correct'
  if (c.kind === 'rule') {
    const at = facts.filter((f) => c.factIds.includes(f.id) && f.sources.some((s) => s.fileId === loc.fileId && sameBox(s.where.bbox, loc)))
    if (at.some((f) => f.group === 'claims')) return 'strike'
  }
  return 'circle'
}

function noteFor(c: Conflict, fileId: string, project: Project): string {
  if (c.kind === 'value' || c.kind === 'list') {
    const onPack = (side: Conflict['left']) => side.sources.some((s) => s.fileId === fileId)
    const other = onPack(c.right) && !onPack(c.left) ? c.left : onPack(c.left) && !onPack(c.right) ? c.right : null
    const src = other?.sources[0]
    if (c.kind === 'value' && other && src) {
      const file = project.files.find((f) => f.id === src.fileId)
      return `${fileShort(file).toLowerCase()} says ${other.value}`
    }
  }
  return c.explanation
}

export interface MarkSet {
  marks: Mark[]
  /** Open findings with no spot on this file (shown as a list instead). */
  offPack: Conflict[]
  resolved: number
  passes: PassTick[]
}

export function buildMarks(project: Project, fileId: string, mockMode: boolean): MarkSet {
  const onFile = project.conflicts.filter((c) => c.locations.some((l) => l.fileId === fileId))
  const open = (c: Conflict) => isOpenFinding(c, project.questions, mockMode)
  const placed: { x: number; y: number; w: number; h: number; drawn: boolean }[] = []
  const marks: Mark[] = []
  // Primary spots first, so a finding's own place gets the ring and other findings' extra spots there stay quiet.
  const order = onFile.flatMap((c) => c.locations.map((l, index) => ({ c, l, index }))).filter(({ c, l }) => l.fileId === fileId && open(c))
  order.sort((a, b) => Number(a.index > 0) - Number(b.index > 0))
  const spotOf = new Map<string, Spot>()
  for (const { c, l, index } of order) {
    const here = placed.filter((p) => near(p.x, l.x) && near(p.y, l.y) && near(p.w, l.w) && near(p.h, l.h))
    const quiet = index > 0 && here.some((p) => p.drawn)
    placed.push({ ...l, drawn: !quiet })
    spotOf.set(`${c.id}#${index}`, {
      x: l.x,
      y: l.y,
      w: l.w,
      h: l.h,
      index,
      ring: here.filter((p) => p.drawn).length,
      tag: here.length,
      quiet,
      style: styleFor(c, l, index, project.facts),
      source: sourceFor(c, l, project.facts),
    })
  }
  onFile.forEach((c, i) => {
    if (!open(c)) return
    const spots: Spot[] = c.locations.flatMap((_, index) => spotOf.get(`${c.id}#${index}`) ?? [])
    const correction = spots[0]?.style === 'correct' ? shortCorrection(c.right.value) : undefined
    marks.push({ conflict: c, n: i + 1, owner: c.owner, spots, note: noteFor(c, fileId, project), correction })
  })
  const offPack = project.conflicts.filter((c) => open(c) && !c.locations.some((l) => l.fileId === fileId))
  const resolved = project.conflicts.filter((c) => !open(c)).length
  const passes: PassTick[] = []
  for (const f of project.facts) {
    if (f.state !== 'pass') continue
    const s = f.sources.find((x) => x.fileId === fileId && x.where.bbox)
    if (s?.where.bbox) passes.push({ fact: f, source: s, bbox: s.where.bbox })
  }
  return { marks, offPack, resolved, passes }
}

/** Accessible name of one spot: the finding text, plus which spot when there are several. */
export function spotLabel(mark: Mark, spot: Spot): string {
  const total = mark.spots.length
  const k = mark.spots.indexOf(spot) + 1
  return total > 1 ? `${mark.conflict.explanation} (spot ${k} of ${total})` : mark.conflict.explanation
}

/* ---------- clusters ---------- */

export interface MarkCluster extends Cluster {
  /** The number written by the box: the lowest finding number in it. */
  n: number
  /** The owner with the most findings in it (sticky-note colour). */
  owner: Owner
  marks: Mark[]
  name: string
  note: string
}

export interface MarkGroups {
  clusters: MarkCluster[]
  singles: Mark[]
}

const OWNER_ORDER: Owner[] = ['legal', 'rnd', 'brand']

/**
 * Group the marks that crowd one region. A finding that links several places on this file stays a single
 * mark, so its rings and arrows still join those places.
 */
export function clusterMarks(marks: Mark[], regions: ClusterRegion[]): MarkGroups {
  const items: ClusterItem[] = marks.flatMap((m) => {
    const s = m.spots[0]
    if (!s) return []
    return [{ id: m.conflict.id, panel: m.conflict.locations[s.index]?.panel ?? '', x: s.x, y: s.y, w: s.w, h: s.h, severity: m.conflict.severity, solo: m.spots.length > 1 }]
  })
  const { clusters } = clusterFindings(items, regions)
  const byId = new Map(marks.map((m) => [m.conflict.id, m]))
  const inCluster = new Set(clusters.flatMap((c) => c.members))
  const out: MarkCluster[] = clusters.map((c) => {
    const list = c.members.map((id) => byId.get(id)!).sort((a, b) => a.n - b.n)
    const tally = new Map<Owner, number>()
    list.forEach((m) => tally.set(m.owner, (tally.get(m.owner) ?? 0) + 1))
    const owner = [...tally.entries()].sort((a, b) => b[1] - a[1] || OWNER_ORDER.indexOf(a[0]) - OWNER_ORDER.indexOf(b[0]))[0][0]
    return { ...c, n: list[0].n, owner, marks: list, name: clusterName(c), note: clusterNote(c) }
  })
  return { clusters: out.sort((a, b) => a.n - b.n), singles: marks.filter((m) => !inCluster.has(m.conflict.id)) }
}

/* ---------- margin notes ---------- */

/** Greedy word wrap; the last line ends in an ellipsis when the text does not fit. */
export function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if (!cur) cur = w
    else if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w
    else {
      lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  let last = kept[maxLines - 1]
  while (last.length > maxChars - 1) last = last.slice(0, last.lastIndexOf(' ') > 0 ? last.lastIndexOf(' ') : maxChars - 1)
  kept[maxLines - 1] = `${last}…`
  return kept
}

/** Something a margin note points at: a single finding's first spot, or a cluster's box. */
export interface NoteTarget {
  id: string
  n: number
  owner: Owner
  note: string
  box: Box
  mark?: Mark
  cluster?: MarkCluster
}

export function noteTargets(singles: Mark[], clusters: MarkCluster[] = []): NoteTarget[] {
  const out: NoteTarget[] = []
  for (const m of singles) {
    const s = m.spots[0]
    if (s) out.push({ id: m.conflict.id, n: m.n, owner: m.owner, note: m.note, box: { x: s.x, y: s.y, w: s.w, h: s.h }, mark: m })
  }
  for (const c of clusters) out.push({ id: c.id, n: c.n, owner: c.owner, note: c.note, box: c.bbox, cluster: c })
  return out
}

export interface NoteBox {
  target: NoteTarget
  side: 'left' | 'right'
  x: number
  y: number
  w: number
  h: number
  lines: string[]
}

export interface NoteLayout {
  /** Width of each note column (mm). */
  width: number
  lineHeight: number
  maxChars: number
  /** Extra height for the owner header on sticky notes. */
  header: number
}

/**
 * Notes go in the margin on the side nearer what they point at, stacked top to bottom in the order of
 * those places' heights, near them, without overlapping and kept inside the page height.
 */
export function layoutNotes(targets: NoteTarget[], page: { w: number; h: number }, opt: NoteLayout): NoteBox[] {
  const gap = 2.5
  const boxes: (NoteBox & { want: number; mid: number })[] = targets.map((t) => {
    const s = t.box
    const lines = wrapText(t.note, opt.maxChars, 4)
    const h = opt.header + lines.length * opt.lineHeight + 3
    const side: 'left' | 'right' = s.x + s.w / 2 < page.w / 2 ? 'left' : 'right'
    const x = side === 'left' ? -opt.width - 4 : page.w + 4
    const mid = s.y + s.h / 2
    // A tall box (a cluster) gets its note level with its top part, not its middle.
    const anchor = t.cluster ? Math.min(mid, s.y + 12) : mid
    return { target: t, side, x, y: 0, w: opt.width, h, lines, want: anchor - h / 2, mid }
  })
  for (const side of ['left', 'right'] as const) {
    const col = boxes.filter((b) => b.side === side).sort((a, b) => a.mid - b.mid || a.target.n - b.target.n)
    let bottom = -Infinity
    for (const b of col) {
      b.y = Math.max(b.want, bottom + gap, 2)
      bottom = b.y + b.h
    }
    // Too low: push back up from the bottom edge.
    let top = page.h - 2
    for (const b of [...col].reverse()) {
      if (b.y + b.h > top) b.y = top - b.h
      top = b.y - gap
    }
  }
  return boxes.map((b) => ({ target: b.target, side: b.side, x: b.x, y: b.y, w: b.w, h: b.h, lines: b.lines }))
}
