import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
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
import type { BBox, PackPanel } from '../../types/project'

/** All sizes in mm: the SVG uses the page's own mm frame (origin top-left), the same as conflict locations. */
const NOTE_W = 78
const MARGIN = NOTE_W + 6
const PEN = 'var(--pen)'
const NOTE_FONT = 7.6
const NOTE_LINE = 7.4
const FIX_FONT = 6.6
const STICKY_HEAD = 6.5

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

function geometry(s: Spot) {
  const cx = s.x + s.w / 2
  const cy = s.y + s.h / 2
  const rx = (s.w / 2) * 1.12 + 1.5 + s.ring * 1.8
  const ry = (s.h / 2) * 1.3 + 1.5 + s.ring * 1.8
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
const BOX_PAD = 2.5

const padBox = (b: { x: number; y: number; w: number; h: number }) => ({ x: b.x - BOX_PAD, y: b.y - BOX_PAD, w: b.w + BOX_PAD * 2, h: b.h + BOX_PAD * 2 })

export function MarkupCanvas({ page, image, panels, hints, set, groups, marked, sticky, animate, interactive = true, selectedId, onSelect, onCluster, expandedId, onPass, label }: Props) {
  const { singles, clusters } = groups ?? { singles: set.marks, clusters: [] }
  const notes = layoutNotes(noteTargets(singles, clusters), page, {
    width: NOTE_W,
    lineHeight: NOTE_LINE,
    maxChars: sticky ? 26 : 24,
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
            strokeWidth={1.1}
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
                strokeWidth={0.7}
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
                strokeWidth={1.3}
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

  const markSpot = ({ m, s }: { m: Mark; s: Spot }) => {
    const { cx, cy, rx, ry } = geometry(s)
    const seed = hashSeed(`${m.conflict.id}#${s.index}`)
    const d0 = (order.get(m.conflict.id) ?? 0) + s.index * 120
    const numAngle = ((-50 + 38 * s.tag) * Math.PI) / 180
    // A struck value has its number just left of it, clear of the correction written above.
    const struck = !s.quiet && s.style === 'correct'
    const nx = struck ? s.x - 3 : cx + (rx + 2.6) * Math.cos(numAngle) * (s.x + s.w / 2 < page.w / 2 ? -1 : 1)
    const ny = struck ? cy - 1.8 : cy + (ry + 2.6) * Math.sin(numAngle)
    const name = spotLabel(m, s)
    // A quiet spot is only its number: the hit area is the number.
    const hit = s.quiet ? { x: nx - 3.5, y: ny - 4, w: 7, h: 7.5 } : { x: cx - rx - 1, y: cy - ry - 1, w: rx * 2 + 2, h: ry * 2 + 2 }
    return (
      <g key={`${m.conflict.id}-${s.index}`} data-mark={m.conflict.id} data-n={m.n}>
        {button(
          name,
          () => onSelect?.(m, s),
          <>
            <rect x={hit.x} y={hit.y} width={hit.w} height={hit.h} fill="transparent" pointerEvents="all" />
            <rect className="mark-focus" x={hit.x - 0.5} y={hit.y - 0.5} width={hit.w + 1} height={hit.h + 1} rx={1.5} fill="none" stroke="var(--info)" strokeWidth={0.7} />
            {!s.quiet && s.style !== 'correct' && (
              <path className="pen-stroke" style={dur(520, d0)} pathLength={1} d={wobblyEllipse(cx, cy, rx, ry, seed)} fill="none" stroke={PEN} strokeWidth={1} strokeLinecap="round" />
            )}
            {inline(m, s, d0)}
            <text
              className="hand pen-ink"
              style={delay(d0 + 350)}
              x={nx}
              y={ny + 2}
              textAnchor="middle"
              fontSize={6}
              fontWeight={700}
              fill={PEN}
              stroke="#fff"
              strokeWidth={1.2}
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

  const noteAnchor = (b: NoteBox): [number, number] => [b.side === 'left' ? b.x + b.w + 1.2 : b.x - 1.2, b.y + Math.min(b.h / 2, 6)]

  const connector = (b: NoteBox) => {
    const t = b.target
    const [ax, ay] = noteAnchor(b)
    let from: [number, number]
    if (t.cluster) {
      from = boxEdgeToward(padBox(t.box), ax, ay)
    } else {
      const { cx, cy, rx, ry } = geometry(t.mark!.spots[0])
      const th = Math.atan2(ay - cy, ax - cx)
      from = [cx + (rx + 0.8) * Math.cos(th), cy + (ry + 0.8) * Math.sin(th)]
    }
    const [shaft, head] = wobblyArrow(from, [ax, ay], hashSeed(`${t.cluster ? t.cluster.key : t.id}>note`))
    const d0 = (order.get(t.id) ?? 0) + 450
    const stroke = sticky ? 'var(--ink-2)' : PEN
    const w = sticky ? 0.55 : 0.8
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
          <text x={b.x + 2.5} y={b.y + 4.8} fontSize={4} fontWeight={600} fill="var(--ink)" fontFamily="IBM Plex Sans" letterSpacing={0.3}>
            {OWNER_LABEL[t.owner].toUpperCase()} · #{t.n}
          </text>
          <text className="hand" fontSize={NOTE_FONT} fill="var(--ink)" fontWeight={500}>
            {b.lines.map((l, i) => (
              <tspan key={i} x={b.x + 2.5} y={b.y + STICKY_HEAD + NOTE_LINE * (i + 1) - 1.4}>
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
    const box = padBox(c.bbox)
    const d0 = order.get(c.id) ?? 0
    const onLeft = c.bbox.x + c.bbox.w / 2 < page.w / 2
    const tx = onLeft ? box.x - 3.2 : box.x + box.w + 3.2
    const ty = box.y + 5
    const expanded = expandedId === c.id
    const focus = c.marks.find((m) => m.conflict.id === selectedId)
    return (
      <g key={`c-${c.key}`} data-cluster={c.id} data-n={c.n} data-count={c.marks.length}>
        {button(
          `${c.name}. ${expanded ? 'Listed below the carton' : 'Show the list'}`,
          () => onCluster?.(c),
          <>
            <rect x={box.x - 1} y={box.y - 1} width={box.w + 2} height={box.h + 2} fill="transparent" pointerEvents="all" />
            <rect className="mark-focus" x={box.x - 1.5} y={box.y - 1.5} width={box.w + 3} height={box.h + 3} rx={2} fill="none" stroke="var(--info)" strokeWidth={0.7} />
            <path
              className="pen-stroke"
              style={dur(700, d0)}
              pathLength={1}
              d={wobblyRect(box.x, box.y, box.w, box.h, hashSeed(c.key))}
              fill="none"
              stroke={PEN}
              strokeWidth={expanded ? 1.3 : 1}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {c.marks.map((m) => (
              <g key={m.conflict.id} data-member={m.conflict.id}>
                {m.spots[0] && inline(m, m.spots[0], order.get(m.conflict.id) ?? d0)}
              </g>
            ))}
            <text
              className="hand pen-ink"
              style={delay(d0 + 350)}
              x={tx}
              y={ty}
              textAnchor="middle"
              fontSize={6}
              fontWeight={700}
              fill={PEN}
              stroke="#fff"
              strokeWidth={1.2}
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
            const { cx, cy, rx, ry } = geometry({ ...s, ring: 0 })
            return (
              <g aria-hidden="true" data-focus={focus.conflict.id} pointerEvents="none">
                <path d={wobblyEllipse(cx, cy, rx + 0.6, ry + 0.6, hashSeed(`${focus.conflict.id}#focus`))} fill="none" stroke={PEN} strokeWidth={1.1} strokeLinecap="round" />
                <text
                  className="hand"
                  x={s.x - 3}
                  y={cy + 1.8}
                  textAnchor="middle"
                  fontSize={5.5}
                  fontWeight={700}
                  fill={PEN}
                  stroke="#fff"
                  strokeWidth={1.2}
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
            <rect x={tx - 4} y={ty - 7} width={20} height={9} fill="transparent" pointerEvents="all" />
            <rect className="mark-focus" x={tx - 4.5} y={ty - 7.5} width={21} height={10} rx={1.5} fill="none" stroke="var(--info)" strokeWidth={0.7} />
            <path className="pen-stroke" style={dur(300, passStart + i * 150)} pathLength={1} d={wobblyTick(tx, ty, 5, hashSeed(t.fact.id))} fill="none" stroke="var(--ok)" strokeWidth={1.1} strokeLinecap="round" strokeLinejoin="round" />
            <text className="hand pen-ink" style={delay(passStart + i * 150 + 250)} x={tx + 5} y={ty - 1} fontSize={6} fontWeight={700} fill="var(--ok)" stroke="#fff" strokeWidth={1.2} paintOrder="stroke">
              pass
            </text>
          </>,
        )}
      </g>
    )
  }

  return (
    <svg
      viewBox={`${-MARGIN} 0 ${page.w + MARGIN * 2} ${page.h}`}
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
  )
}
