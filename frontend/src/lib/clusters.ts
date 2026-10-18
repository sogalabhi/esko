import { GROUPS } from './labels'
import type { Fact, FactGroup, Severity } from '../types/project'

/**
 * Group findings that crowd one place on the pack into a single mark with a count, so a table full of
 * wrong rows reads as one problem area instead of a pile of pins. Pure: shared by the 2D red pen and the
 * 3D pins. All positions are page mm (origin top-left, y down), the same frame as conflict locations.
 */

export type ClusterSeverity = Severity | 'pass'

export interface ClusterItem {
  id: string
  panel: string
  x: number
  y: number
  w: number
  h: number
  severity: ClusterSeverity
  /** Never grouped: e.g. a finding that links several places on the pack (its point is the link). */
  solo?: boolean
}

/** A labelled box on the pack: a pack zone, or a printed block derived from the facts. */
export interface ClusterRegion {
  panel: string
  x: number
  y: number
  w: number
  h: number
  label: string
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface Cluster {
  /** Deterministic: the region (or panel) plus the sorted member ids. */
  id: string
  /** The place only, without the members: stays the same when a member is resolved. */
  key: string
  /** The region's label, or "N findings · <panel>" for findings grouped by distance. */
  label: string
  kind: 'region' | 'near'
  panel: string
  bbox: Box
  /** Member ids in input order. */
  members: string[]
  worst: ClusterSeverity
}

export interface ClusterResult {
  clusters: Cluster[]
  /** Ids that stay their own mark, in input order. */
  singles: string[]
}

/** A group needs at least this many findings; fewer stay single marks. */
export const CLUSTER_MIN = 3
/** Findings outside every region group when their centres chain within this distance (mm). */
export const NEAR_MM = 25

const RANK: Record<ClusterSeverity, number> = { high: 0, medium: 1, low: 2, pass: 3 }

export function worstSeverity(list: ClusterSeverity[]): ClusterSeverity {
  return list.reduce<ClusterSeverity>((w, s) => (RANK[s] < RANK[w] ? s : w), 'pass')
}

function fnv(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32) || 'x'

const centre = (b: Box) => ({ cx: b.x + b.w / 2, cy: b.y + b.h / 2 })
const inside = (r: Box, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h

export function unionBox(boxes: Box[]): Box {
  const x1 = Math.min(...boxes.map((b) => b.x))
  const y1 = Math.min(...boxes.map((b) => b.y))
  const x2 = Math.max(...boxes.map((b) => b.x + b.w))
  const y2 = Math.max(...boxes.map((b) => b.y + b.h))
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

const r2 = (v: number) => Math.round(v * 10) / 10

export function clusterFindings(items: ClusterItem[], regions: ClusterRegion[], opt: { min?: number; nearMm?: number } = {}): ClusterResult {
  const min = opt.min ?? CLUSTER_MIN
  const nearMm = opt.nearMm ?? NEAR_MM
  const index = new Map(items.map((it, i) => [it.id, i]))
  const free: ClusterItem[] = []
  const byRegion = new Map<string, { region: ClusterRegion; items: ClusterItem[] }>()
  const singles = new Set<string>()

  for (const it of items) {
    if (it.solo) {
      singles.add(it.id)
      continue
    }
    const { cx, cy } = centre(it)
    // The most specific region holding the item's centre; ties go to the earlier region.
    let best = -1
    regions.forEach((r, i) => {
      if (!inside(r, cx, cy)) return
      if (best < 0 || r.w * r.h < regions[best].w * regions[best].h) best = i
    })
    if (best < 0) {
      free.push(it)
      continue
    }
    // Items on different panels never share a group, even under one region.
    const k = `${best}|${it.panel}`
    const g = byRegion.get(k) ?? { region: regions[best], items: [] }
    g.items.push(it)
    byRegion.set(k, g)
  }

  const clusters: Cluster[] = []
  const make = (kind: Cluster['kind'], key: string, label: string, panel: string, members: ClusterItem[], region?: ClusterRegion) => {
    const sorted = members.map((m) => m.id).sort()
    const boxes: Box[] = members.map((m) => ({ x: m.x, y: m.y, w: m.w, h: m.h }))
    if (region) boxes.push(region)
    clusters.push({
      id: `cluster-${slug(label)}-${fnv(`${key}|${sorted.join(',')}`)}`,
      key,
      label,
      kind,
      panel,
      bbox: unionBox(boxes),
      members: members.map((m) => m.id),
      worst: worstSeverity(members.map((m) => m.severity)),
    })
  }

  for (const { region, items: list } of byRegion.values()) {
    if (list.length < min) {
      list.forEach((it) => singles.add(it.id))
      continue
    }
    const panel = list[0].panel
    make('region', `region|${panel}|${region.label}|${r2(region.x)},${r2(region.y)},${r2(region.w)},${r2(region.h)}`, region.label, panel, list, region)
  }

  // Outside every region: chain items on the same panel whose centres are within nearMm.
  const panels = [...new Set(free.map((it) => it.panel))]
  for (const panel of panels) {
    const list = free.filter((it) => it.panel === panel)
    const parent = list.map((_, i) => i)
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = centre(list[i])
        const b = centre(list[j])
        if (Math.hypot(a.cx - b.cx, a.cy - b.cy) <= nearMm) parent[find(i)] = find(j)
      }
    }
    const groups = new Map<number, ClusterItem[]>()
    list.forEach((it, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), it]))
    for (const g of groups.values()) {
      if (g.length < min) {
        g.forEach((it) => singles.add(it.id))
        continue
      }
      const first = [...g.map((m) => m.id)].sort()[0]
      make('near', `near|${panel}|${first}`, `${g.length} findings · ${panel}`, panel, g)
    }
  }

  const at = (id: string) => index.get(id) ?? 0
  for (const c of clusters) c.members.sort((a, b) => at(a) - at(b))
  clusters.sort((a, b) => at(a.members[0]) - at(b.members[0]))
  return { clusters, singles: [...singles].sort((a, b) => at(a) - at(b)) }
}

/** Accessible name of a cluster: "Nutrition: 13 problems". */
export function clusterName(c: Pick<Cluster, 'kind' | 'label' | 'panel' | 'members'>): string {
  const n = c.members.length
  return c.kind === 'region' ? `${c.label}: ${n} problems` : `${n} problems close together · ${c.panel}`
}

/** The margin note a reviewer writes for a cluster: "13 problems in Nutrition". */
export function clusterNote(c: Pick<Cluster, 'kind' | 'label' | 'panel' | 'members'>): string {
  const n = c.members.length
  return c.kind === 'region' ? `${n} problems in ${c.label}` : `${n} problems close together on ${c.panel}`
}

/* ---------- printed blocks from the facts ---------- */

const GROUP_LABEL = new Map<FactGroup, string>(GROUPS.map((g) => [g.id, g.label]))

/** Two boxes count as one printed block when their edges are within this gap (mm). */
export const BLOCK_GAP_MM = 5

function gap(a: Box, b: Box): number {
  const dx = Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w))
  const dy = Math.max(0, a.y - (b.y + b.h), b.y - (a.y + a.h))
  return Math.max(dx, dy)
}

/**
 * Where each group of facts is printed on a file: the source boxes of one fact group on one panel,
 * chained when they touch (rows of one table), labelled with the group's name. Comes from the checked
 * fact sources only, so no position is guessed.
 */
export function regionsFromFacts(facts: Fact[], fileId: string, gapMm = BLOCK_GAP_MM): ClusterRegion[] {
  const by = new Map<string, { group: FactGroup; panel: string; boxes: Box[] }>()
  for (const f of facts) {
    for (const s of f.sources) {
      const b = s.where.bbox
      if (s.fileId !== fileId || !b || !s.where.panel) continue
      const k = `${f.group}|${s.where.panel}`
      const e = by.get(k) ?? { group: f.group, panel: s.where.panel, boxes: [] }
      if (!e.boxes.some((o) => o.x === b[0] && o.y === b[1] && o.w === b[2] && o.h === b[3])) e.boxes.push({ x: b[0], y: b[1], w: b[2], h: b[3] })
      by.set(k, e)
    }
  }
  const out: ClusterRegion[] = []
  for (const { group, panel, boxes } of by.values()) {
    const parent = boxes.map((_, i) => i)
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (gap(boxes[i], boxes[j]) <= gapMm) parent[find(i)] = find(j)
    const blocks = new Map<number, Box[]>()
    boxes.forEach((b, i) => blocks.set(find(i), [...(blocks.get(find(i)) ?? []), b]))
    for (const list of blocks.values()) out.push({ panel, ...unionBox(list), label: GROUP_LABEL.get(group) ?? group })
  }
  return out
}
