import { useMemo, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react'
import { useViewGestures } from './useViewGestures'
import { useViewport } from './useViewport'
import { OWNER_LABEL } from '../../lib/labels'
import {
  boxEdgeToward,
  hashSeed,
  layoutNotes,
  noteTargets,
  rng,
  spotLabel,
  wobblyArrow,
  wobblyEllipse,
  wobblyLine,
  wobblyRect,
  wobblyTick,
  type Mark,
  type MarkCluster,
  type MarkGroups,
  type MarkSet,
  type NoteBox,
  type PassTick,
  type Spot,
} from '../../lib/markup'
import type { BBox, PackPanel, Verdict } from '../../types/project'

/** All sizes in mm: the SVG uses the page's own mm frame (origin top-left), the same as conflict locations. */
const NOTE_W = 60
const MARGIN = NOTE_W + 6
/** Pen colour by verdict: red Fail, amber Needs review, green Pass. Words always sit beside it (notes, names, legend). */
const PEN_BY: Record<Verdict, string> = { fail: 'var(--pen)', review: 'var(--warn)', pass: 'var(--ok)' }
const penOf = (v: Verdict) => PEN_BY[v]
const NOTE_FONT = 4.8
const NOTE_LINE = 5.2
const FIX_FONT = 4.4
const STICKY_HEAD = 4.8
const NUM_FONT = 4
/** Pen line widths (mm) at fit. Zoomed in, lines thin out (by the square root of the zoom) so the artwork under them stays readable. */
const PEN_W_FIT = 0.5
const HALO_W_FIT = 0.8
/** A spot this tall or wide (mm) is a region (a photo, a block of copy): boxed at its edge, not circled. */
const BIG_H = 20
const BIG_W = 60
/** A spot this short (mm) is one line of small print (a nutrition row): an arrow points at it, no ring or pen on the copy. */
const SMALL_H = 3.6
const ARROW_LEN = 5

export interface Page {
  w: number
  h: number
}

interface Props {
  page: Page
  /** Rendered page 1 of the pack PDF; without it the panel outlines are drawn. */
  image?: string | null
  panels: PackPanel[]
  /** Text positions on the pack, drawn as faint blocks in the outline view. */
  hints: BBox[]
  set: MarkSet
  /** Clusters and single marks (from clusterMarks); without it every mark is single. */
  groups?: MarkGroups
  marked: boolean
  sticky: boolean
  animate: boolean
  /** Poster copy: no buttons, hidden from assistive tech. */
  interactive?: boolean
  selectedId?: string | null
  onSelect?: (mark: Mark, spot: Spot) => void
  /** A cluster's box or note was clicked. */
  onCluster?: (cluster: MarkCluster) => void
  /** The cluster whose member list is open (its box reads as expanded). */
  expandedId?: string | null
  onPass?: (tick: PassTick) => void
  label: string
}

const ownerFill = (o: Mark['owner']) => `var(--owner-${o})`

const isBig = (s: Spot) => s.h > BIG_H || s.w > BIG_W
const isSmall = (s: Spot) => s.h <= SMALL_H

/** Where a small spot's arrow sits: on the page side nearer the notes, pointing in at the spot's edge. */
function pointer(s: Spot, pageW: number) {
  const right = s.x + s.w / 2 >= pageW / 2
  const edge = right ? s.x + s.w + 0.6 : s.x - 0.6
  const tail = right ? edge + ARROW_LEN : edge - ARROW_LEN
  return { right, edge, tail, cy: s.y + s.h / 2 }
}

function geometry(s: Spot) {
  const cx = s.x + s.w / 2
  const cy = s.y + s.h / 2
  if (isBig(s)) return { cx, cy, rx: s.w / 2 + 1 + s.ring, ry: s.h / 2 + 1 + s.ring }
  const rx = (s.w / 2) * 1.06 + 1 + s.ring * 1.2
  const ry = (s.h / 2) * 1.15 + 1 + s.ring * 1.2
  return { cx, cy, rx, ry }
}

const delay = (ms: number): CSSProperties => ({ ['--d' as string]: `${Math.round(ms)}ms` })
const dur = (ms: number, d: number): CSSProperties => ({ ['--d' as string]: `${Math.round(d)}ms`, ['--dur' as string]: `${ms}ms` })

function activate(e: KeyboardEvent, fn: () => void) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    fn()
  }
}

/** Padding (mm) between a cluster's content and its box. */
const BOX_PAD = 1.5

const padBox = (b: { x: number; y: number; w: number; h: number }) => ({ x: b.x - BOX_PAD, y: b.y - BOX_PAD, w: b.w + BOX_PAD * 2, h: b.h + BOX_PAD * 2 })

export function MarkupCanvas({ page, image, panels, hints, set, groups, marked, sticky, animate, interactive = true, selectedId, onSelect, onCluster, expandedId, onPass, label }: Props) {
  const { singles, clusters } = groups ?? { singles: set.marks, clusters: [] }
  // Zoom and pan: a window (viewBox) onto the whole page; wheel, drag, pinch and the buttons below move it.
  const frame = useMemo(() => ({ x: -MARGIN, y: 0, w: page.w + MARGIN * 2, h: page.h }), [page.w, page.h])
  const viewport = useViewport(frame)
  const thin = 1 / Math.sqrt(interactive ? Math.max(1, viewport.zoom) : 1)
  const PEN_W = PEN_W_FIT * thin
  const HALO_W = HALO_W_FIT * thin
  const wrap = useRef<HTMLDivElement>(null)
  const gestures = useViewGestures(wrap, interactive ? viewport : undefined)
  const notes = layoutNotes(noteTargets(singles, clusters), page, {
    width: NOTE_W,
    lineHeight: NOTE_LINE,
    maxChars: sticky ? 30 : 28,
    header: sticky ? STICKY_HEAD : 0,
  })
  // One drawing slot per visible unit (a single mark or a whole cluster), in number order.
  const units = [...singles.map((m) => ({ id: m.conflict.id, n: m.n })), ...clusters.map((c) => ({ id: c.id, n: c.n }))].sort((a, b) => a.n - b.n)
  const step = Math.min(200, 2300 / Math.max(1, units.length))
  const order = new Map(units.map((u, i) => [u.id, i * step]))
  for (const c of clusters) for (const m of c.marks) order.set(m.conflict.id, (order.get(c.id) ?? 0) + 200)
  const passStart = units.length * step + 400

  // Where corrections go: above the wrong value; to its right when another correction sits just above,
  // unless that runs off the page, then above and ending at the value's right edge.
  const corrections = set.marks.flatMap((m) => (m.correction ? [{ m, s: m.spots[0] }] : []))
  const place = new Map<string, 'above' | 'right' | 'aboveEnd'>()
  for (const { m, s } of corrections) {
    const crowded = corrections.some((o) => o.s !== s && o.s.y < s.y && s.y - o.s.y < 7 && Math.abs(o.s.x - s.x) < 20)
    const fits = s.x + s.w + 1.5 + (m.correction?.length ?? 0) * FIX_FONT * 0.5 <= page.w
    place.set(m.conflict.id, !crowded ? 'above' : fits ? 'right' : 'aboveEnd')
  }

  const spots = singles.flatMap((m) => m.spots.map((s) => ({ m, s })))
  // Outer rings first so the inner (smaller) marks stay clickable on top.
  spots.sort((a, b) => b.s.ring - a.s.ring || a.m.n - b.m.n)

  const button = (name: string, onClick: () => void, children: ReactNode, extra: Record<string, unknown> = {}) =>
    interactive ? (
      <g role="button" tabIndex={0} aria-label={name} className="mark-btn" onClick={onClick} onKeyDown={(e) => activate(e, onClick)} {...extra}>
        <title>{name}</title>
        {children}
      </g>
    ) : (
      <g {...extra}>{children}</g>
    )

  /** Strike-throughs and the corrected value: drawn the same inside a cluster box as on a single mark. */
  const inline = (m: Mark, s: Spot, d0: number) => {
    if (s.quiet) return null
    const PEN = penOf(m.verdict)
    const { cx, cy } = geometry(s)
    const seed = hashSeed(`${m.conflict.id}#${s.index}`)
    const r = rng(seed)
    const where = place.get(m.conflict.id) ?? 'above'
    const right = where === 'right'
    return (
      <>
        {s.style === 'strike' && (
          <path
            className="pen-stroke"
            style={dur(260, d0 + 420)}
            pathLength={1}
            d={wobblyLine(s.x - 1, s.y + s.h * 0.72, s.x + s.w + 1, s.y + s.h * 0.3, seed + 1)}
            fill="none"
            stroke={PEN}
            strokeWidth={PEN_W + 0.1}
            strokeLinecap="round"
          />
        )}
        {s.style === 'correct' && (
          <>
            {[-0.45, 0.45].map((o, k) => (
              <path
                key={k}
                className="pen-stroke"
                style={dur(220, d0 + k * 120)}
                pathLength={1}
                d={wobblyLine(s.x - 0.8, cy + o + (r() - 0.5) * 0.3, s.x + s.w + 0.8, cy + o - 0.25, seed + 2 + k)}
                fill="none"
                stroke={PEN}
                strokeWidth={PEN_W * 0.7}
                strokeLinecap="round"
              />
            ))}
            {m.correction && (
              <text
                className="hand pen-ink"
                style={delay(d0 + 300)}
                x={right ? s.x + s.w + 1.5 : where === 'aboveEnd' ? s.x + s.w + 1 : cx}
                y={right ? cy + 2 : s.y - 1}
                textAnchor={right ? 'start' : where === 'aboveEnd' ? 'end' : 'middle'}
                fontSize={FIX_FONT}
                fontWeight={700}
                fill={PEN}
                stroke="#fff"
                strokeWidth={HALO_W}
                paintOrder="stroke"
                transform={`rotate(-4 ${right ? s.x + s.w : cx} ${s.y})`}
              >
                {m.correction}
              </text>
            )}
          </>
        )}
      </>
    )
  }

  /** A short pen arrow from `tail` to `head` (mm). */
  const arrow = (tail: [number, number], head: [number, number], seed: number, PEN: string, d0: number) => {
    const [shaft, tip] = wobblyArrow(tail, head, seed)
    return (
      <>
        <path className="pen-stroke" style={dur(260, d0)} pathLength={1} d={shaft} fill="none" stroke={PEN} strokeWidth={PEN_W} strokeLinecap="round" />
        <path className="pen-stroke" style={dur(120, d0 + 260)} pathLength={1} d={tip} fill="none" stroke={PEN} strokeWidth={PEN_W} strokeLinecap="round" strokeLinejoin="round" />
      </>
    )
  }

  /** One line of small print: an arrow at its edge and the number at the arrow's tail; the copy itself stays clean. */
  const smallSpot = (m: Mark, s: Spot, seed: number, d0: number, name: string) => {
    const PEN = penOf(m.verdict)
    const { right, edge, tail, cy } = pointer(s, page.w)
    const numX = right ? tail + 0.8 : tail - 0.8
    const hit = { x: Math.min(s.x, tail) - (right ? 0 : 6), y: s.y - 0.5, w: s.w + ARROW_LEN + 7, h: s.h + 1 }
    return (
      <g key={`${m.conflict.id}-${s.index}`} data-mark={m.conflict.id} data-n={m.n} data-verdict={m.verdict} data-pointer="">
        {button(
          name,
          () => onSelect?.(m, s),
          <>
            <rect x={hit.x} y={hit.y} width={hit.w} height={hit.h} fill="transparent" pointerEvents="all" />
            <rect className="mark-focus" x={hit.x - 0.5} y={hit.y - 0.5} width={hit.w + 1} height={hit.h + 1} rx={1} fill="none" stroke="var(--info)" strokeWidth={0.5} />
            {arrow([tail, cy], [edge, cy], seed, PEN, d0)}
            <text
              className="hand pen-ink"
              style={delay(d0 + 300)}
              x={numX}
              y={cy + 1.2}
              textAnchor={right ? 'start' : 'end'}
              fontSize={NUM_FONT * 0.85}
              fontWeight={700}
              fill={PEN}
              stroke="#fff"
              strokeWidth={HALO_W}
              paintOrder="stroke"
            >
              {m.n}
            </text>
          </>,
          { 'data-selected': selectedId === m.conflict.id ? '' : undefined },
        )}
      </g>
    )
  }

  const markSpot = ({ m, s }: { m: Mark; s: Spot }) => {
    const PEN = penOf(m.verdict)
    const { cx, cy, rx, ry } = geometry(s)
    const seed = hashSeed(`${m.conflict.id}#${s.index}`)
    const d0 = (order.get(m.conflict.id) ?? 0) + s.index * 120
    const numAngle = ((-50 + 38 * s.tag) * Math.PI) / 180
    // A struck value has its number just left of it, clear of the correction written above.
    const struck = !s.quiet && s.style === 'correct'
    const nx = struck ? s.x - 2.2 : cx + (rx + 1.8) * Math.cos(numAngle) * (s.x + s.w / 2 < page.w / 2 ? -1 : 1)
    const ny = struck ? cy - 1.2 : cy + (ry + 1.8) * Math.sin(numAngle)
    const name = spotLabel(m, s)
    if (isSmall(s) && !s.quiet) return smallSpot(m, s, seed, d0, name)
    // A quiet spot is only its number: the hit area is the number.
    const hit = s.quiet ? { x: nx - 2.5, y: ny - 3, w: 5, h: 5.5 } : { x: cx - rx - 1, y: cy - ry - 1, w: rx * 2 + 2, h: ry * 2 + 2 }
    return (
      <g key={`${m.conflict.id}-${s.index}`} data-mark={m.conflict.id} data-n={m.n} data-verdict={m.verdict}>
        {button(
          name,
          () => onSelect?.(m, s),
          <>
            <rect x={hit.x} y={hit.y} width={hit.w} height={hit.h} fill="transparent" pointerEvents="all" />
            <rect className="mark-focus" x={hit.x - 0.5} y={hit.y - 0.5} width={hit.w + 1} height={hit.h + 1} rx={1.5} fill="none" stroke="var(--info)" strokeWidth={0.5} />
            {!s.quiet && s.style !== 'correct' && (
              <path
                className="pen-stroke"
                style={dur(520, d0)}
                pathLength={1}
                d={isBig(s) ? wobblyRect(cx - rx, cy - ry, rx * 2, ry * 2, seed) : wobblyEllipse(cx, cy, rx, ry, seed)}
                fill="none"
                stroke={PEN}
                strokeWidth={PEN_W}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            {inline(m, s, d0)}
            <text
              className="hand pen-ink"
              style={delay(d0 + 350)}
              x={nx}
              y={ny + 1.4}
              textAnchor="middle"
              fontSize={NUM_FONT}
              fontWeight={700}
              fill={PEN}
              stroke="#fff"
              strokeWidth={HALO_W}
              paintOrder="stroke"
            >
              {m.n}
            </text>
          </>,
          { 'data-selected': selectedId === m.conflict.id ? '' : undefined },
        )}
      </g>
    )
  }

  const noteAnchor = (b: NoteBox): [number, number] => [b.side === 'left' ? b.x + b.w + 1 : b.x - 1, b.y + Math.min(b.h / 2, 4)]

  const connector = (b: NoteBox) => {
    const t = b.target
    const [ax, ay] = noteAnchor(b)
    let from: [number, number]
    if (t.cluster) {
      from = boxEdgeToward(padBox(t.box), ax, ay)
    } else {
      const s = t.mark!.spots[0]
      if (isSmall(s) && !s.quiet) {
        const p = pointer(s, page.w)
        from = [p.right ? p.tail + 4.5 : p.tail - 4.5, p.cy]
      } else {
        const { cx, cy, rx, ry } = geometry(s)
        const th = Math.atan2(ay - cy, ax - cx)
        from = [cx + (rx + 0.5) * Math.cos(th), cy + (ry + 0.5) * Math.sin(th)]
      }
    }
    const [shaft, head] = wobblyArrow(from, [ax, ay], hashSeed(`${t.cluster ? t.cluster.key : t.id}>note`))
    const d0 = (order.get(t.id) ?? 0) + 450
    const stroke = sticky ? 'var(--ink-2)' : penOf(t.cluster ? t.cluster.verdict : t.mark!.verdict)
    const w = sticky ? PEN_W * 0.6 : PEN_W * 0.8
    return (
      <g key={`a-${t.id}`} aria-hidden="true">
        <path className="pen-stroke" style={dur(380, d0)} pathLength={1} d={shaft} fill="none" stroke={stroke} strokeWidth={w} strokeLinecap="round" />
        <path className="pen-stroke" style={dur(140, d0 + 380)} pathLength={1} d={head} fill="none" stroke={stroke} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    )
  }

  const note = (b: NoteBox) => {
    const t = b.target
    const id = t.id
    const d0 = (order.get(id) ?? 0) + 650
    const open = () => (t.cluster ? onCluster?.(t.cluster) : onSelect?.(t.mark!, t.mark!.spots[0]))
    const left = b.side === 'left'
    const PEN = penOf(t.cluster ? t.cluster.verdict : t.mark!.verdict)
    const attrs = { 'data-note': id, 'data-note-kind': t.cluster ? 'cluster' : 'mark' }
    if (sticky) {
      const tilt = (rng(hashSeed(`${t.cluster ? t.cluster.key : id}~sticky`))() - 0.5) * 2.4
      return (
        <g
          key={`n-${id}`}
          aria-hidden="true"
          {...attrs}
          data-owner={t.owner}
          className="pen-ink"
          style={{ ...delay(d0), cursor: interactive ? 'pointer' : undefined }}
          onClick={interactive ? open : undefined}
          transform={`rotate(${tilt.toFixed(2)} ${b.x + b.w / 2} ${b.y + b.h / 2})`}
        >
          <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={0.8} fill={ownerFill(t.owner)} stroke="rgba(22,24,29,0.28)" strokeWidth={0.3} />
          <text x={b.x + 2} y={b.y + 3.6} fontSize={3} fontWeight={600} fill="var(--ink)" fontFamily="IBM Plex Sans" letterSpacing={0.3}>
            {OWNER_LABEL[t.owner].toUpperCase()} · #{t.n}
          </text>
          <text className="hand" fontSize={NOTE_FONT} fill="var(--ink)" fontWeight={500}>
            {b.lines.map((l, i) => (
              <tspan key={i} x={b.x + 2} y={b.y + STICKY_HEAD + NOTE_LINE * (i + 1) - 1}>
                {l}
              </tspan>
            ))}
          </text>
        </g>
      )
    }
    return (
      <g key={`n-${id}`} aria-hidden="true" {...attrs} className="pen-ink" style={{ ...delay(d0), cursor: interactive ? 'pointer' : undefined }} onClick={interactive ? open : undefined}>
        <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="transparent" />
        <text className="hand" fontSize={NOTE_FONT} fill={PEN} fontWeight={500} textAnchor={left ? 'end' : 'start'}>
          {b.lines.map((l, i) => (
            <tspan key={i} x={left ? b.x + b.w : b.x} y={b.y + NOTE_LINE * (i + 1) - 1}>
              {i === 0 ? `${t.n}. ${l}` : l}
            </tspan>
          ))}
        </text>
      </g>
    )
  }

  /**
   * A cluster: one pen box round the region, one number, the members' corrections inside it, and the
   * selected member ringed. The box is one button; its members are listed beside the canvas.
   */
  const clusterMark = (c: MarkCluster) => {
    const PEN = penOf(c.verdict)
    const box = padBox(c.bbox)
    const d0 = order.get(c.id) ?? 0
    const onLeft = c.bbox.x + c.bbox.w / 2 < page.w / 2
    const tx = onLeft ? box.x - 2.4 : box.x + box.w + 2.4
    const ty = box.y + 3.6
    const expanded = expandedId === c.id
    const focus = c.marks.find((m) => m.conflict.id === selectedId)
    const rows = new Set<number>()
    return (
      <g key={`c-${c.key}`} data-cluster={c.id} data-n={c.n} data-count={c.marks.length} data-verdict={c.verdict}>
        {button(
          `${c.name}. ${expanded ? 'Listed below the carton' : 'Show the list'}`,
          () => onCluster?.(c),
          <>
            <rect x={box.x - 1} y={box.y - 1} width={box.w + 2} height={box.h + 2} fill="transparent" pointerEvents="all" />
            <rect className="mark-focus" x={box.x - 1.5} y={box.y - 1.5} width={box.w + 3} height={box.h + 3} rx={2} fill="none" stroke="var(--info)" strokeWidth={0.5} />
            <path
              className="pen-stroke"
              style={dur(700, d0)}
              pathLength={1}
              d={wobblyRect(box.x, box.y, box.w, box.h, hashSeed(c.key))}
              fill="none"
              stroke={PEN}
              strokeWidth={expanded ? PEN_W * 1.6 : PEN_W}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {c.marks.map((m) => {
              const s = m.spots[0]
              if (!s) return null
              const md = order.get(m.conflict.id) ?? d0
              if (!isSmall(s)) {
                return (
                  <g key={m.conflict.id} data-member={m.conflict.id}>
                    {inline(m, s, md)}
                  </g>
                )
              }
              // One arrow per row (two findings on one row share it), on the side away from the cluster number.
              const cy = s.y + s.h / 2
              const row = Math.round(cy * 2)
              if (rows.has(row)) return <g key={m.conflict.id} data-member={m.conflict.id} />
              rows.add(row)
              const edge = onLeft ? box.x + box.w + 0.4 : box.x - 0.4
              const tail = onLeft ? edge + ARROW_LEN - 1.5 : edge - ARROW_LEN + 1.5
              return (
                <g key={m.conflict.id} data-member={m.conflict.id} data-pointer="">
                  {arrow([tail, cy], [edge, cy], hashSeed(`${m.conflict.id}#row`), penOf(m.verdict), md)}
                </g>
              )
            })}
            <text
              className="hand pen-ink"
              style={delay(d0 + 350)}
              x={tx}
              y={ty}
              textAnchor="middle"
              fontSize={NUM_FONT}
              fontWeight={700}
              fill={PEN}
              stroke="#fff"
              strokeWidth={HALO_W}
              paintOrder="stroke"
            >
              {c.n}
            </text>
          </>,
          interactive ? { 'aria-expanded': expanded, 'data-selected': expanded ? '' : undefined } : {},
        )}
        {focus?.spots[0] &&
          (() => {
            const s = focus.spots[0]
            const FOCUS_PEN = penOf(focus.verdict)
            const { cx, cy, rx, ry } = geometry({ ...s, ring: 0 })
            return (
              <g aria-hidden="true" data-focus={focus.conflict.id} pointerEvents="none">
                <path d={wobblyEllipse(cx, cy, rx + 0.4, ry + 0.4, hashSeed(`${focus.conflict.id}#focus`))} fill="none" stroke={FOCUS_PEN} strokeWidth={PEN_W + 0.1} strokeLinecap="round" />
                <text
                  className="hand"
                  x={s.x - 2.2}
                  y={cy + 1.3}
                  textAnchor="middle"
                  fontSize={NUM_FONT * 0.9}
                  fontWeight={700}
                  fill={FOCUS_PEN}
                  stroke="#fff"
                  strokeWidth={HALO_W}
                  paintOrder="stroke"
                >
                  {focus.n}
                </text>
              </g>
            )
          })()}
      </g>
    )
  }

  const pass = (t: PassTick, i: number) => {
    const [x, y, w] = t.bbox
    const tx = x + w * 0.4
    const ty = y - 1.2
    const name = `Check passed: ${t.fact.field}${t.fact.value ? ` ${t.fact.value}` : ''}`
    return (
      <g key={`p-${t.fact.id}`} data-pass={t.fact.id}>
        {button(
          name,
          () => onPass?.(t),
          <>
            <rect x={tx - 3} y={ty - 5} width={14} height={6.5} fill="transparent" pointerEvents="all" />
            <rect className="mark-focus" x={tx - 3.5} y={ty - 5.5} width={15} height={7.5} rx={1.2} fill="none" stroke="var(--info)" strokeWidth={0.5} />
            <path className="pen-stroke" style={dur(300, passStart + i * 150)} pathLength={1} d={wobblyTick(tx, ty, 3.5, hashSeed(t.fact.id))} fill="none" stroke="var(--ok)" strokeWidth={PEN_W + 0.1} strokeLinecap="round" strokeLinejoin="round" />
            <text className="hand pen-ink" style={delay(passStart + i * 150 + 250)} x={tx + 3.6} y={ty - 0.8} fontSize={NUM_FONT} fontWeight={700} fill="var(--ok)" stroke="#fff" strokeWidth={HALO_W} paintOrder="stroke">
              pass
            </text>
          </>,
        )}
      </g>
    )
  }

  const zoomed = viewport.zoom > 1.001
  const zoomButton = 'inline-flex h-8 w-8 items-center justify-center rounded-chip border border-border bg-surface text-ink hover:bg-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-info'
  return (
    <div
      ref={wrap}
      className="relative overflow-hidden"
      style={interactive ? { touchAction: 'none', cursor: zoomed ? 'grab' : undefined } : undefined}
      data-zoom={interactive ? viewport.zoom.toFixed(2) : undefined}
      {...(interactive ? gestures : {})}
    >
    <svg
      viewBox={`${viewport.view.x} ${viewport.view.y} ${viewport.view.w} ${viewport.view.h}`}
      className={`block h-auto w-full ${animate ? '' : 'still'}`}
      role={interactive ? 'group' : undefined}
      aria-label={interactive ? label : undefined}
      aria-hidden={interactive ? undefined : 'true'}
      data-marked={marked || undefined}
    >
      <rect x={-MARGIN} y={0} width={page.w + MARGIN * 2} height={page.h} fill="var(--surface)" />
      {image ? (
        <image href={image} x={0} y={0} width={page.w} height={page.h} preserveAspectRatio="none" />
      ) : (
        <g aria-hidden="true">
          <rect x={0} y={0} width={page.w} height={page.h} fill="var(--bg)" />
          {panels.map((p) => (
            <g key={p.name}>
              <rect x={p.x} y={p.y} width={p.w} height={p.h} fill="var(--surface)" stroke="var(--ink-2)" strokeWidth={0.5} strokeDasharray="3 2" />
              <text x={p.x + 3} y={p.y + 7} fontSize={5} fill="var(--ink-2)" fontFamily="IBM Plex Sans">
                {p.name}
              </text>
            </g>
          ))}
          {hints.map((b, i) => (
            <rect key={i} x={b[0]} y={b[1]} width={b[2]} height={b[3]} rx={0.6} fill="var(--border)" />
          ))}
        </g>
      )}
      {marked && (
        <g data-layer="marks">
          {notes.map(connector)}
          {clusters.map(clusterMark)}
          {spots.map(markSpot)}
          {notes.map(note)}
          {set.passes.map(pass)}
        </g>
      )}
    </svg>
    {interactive && (
      <div role="group" aria-label="Zoom" className="absolute right-2 top-2 flex items-center gap-1">
        <button type="button" className={zoomButton} onClick={() => viewport.zoomIn()} aria-label="Zoom in" title="Zoom in">
          <ZoomIn size={16} aria-hidden="true" />
        </button>
        <button type="button" className={zoomButton} onClick={() => viewport.zoomOut()} aria-label="Zoom out" title="Zoom out" disabled={!zoomed}>
          <ZoomOut size={16} aria-hidden="true" />
        </button>
        <button type="button" className={zoomButton} onClick={() => viewport.fit()} aria-label="Fit the whole carton" title="Fit the whole carton" disabled={!zoomed}>
          <Maximize2 size={15} aria-hidden="true" />
        </button>
        <span className="rounded-chip bg-surface px-1.5 py-0.5 font-mono text-[12px] text-ink-2" aria-live="polite">
          {Math.round(viewport.zoom * 100)}%
        </span>
      </div>
    )}
    </div>
  )
}
