import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  BackSide,
  BufferGeometry,
  Float32BufferAttribute,
  FrontSide,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type Group,
} from 'three'
import type { ArtworkTexture } from './artwork'
import type { ClusterRegion } from '../lib/clusters'
import { buildHingeTree, flatPoint, layoutAt, pageToUv, panelFor, pinGroups, type HingeTree, type Layout, type PageFrame, type PinCluster } from './geometry'
import { MISSING_META, REGULATED_META, SEVERITY_META, TOKEN_HEX } from './meta'
import type { DielinePanel, PackFinding, PackGeometry, PackRegion } from './types'

/** How far (mm) inner flaps sit inside the outer faces, so they never z-fight. */
const INNER_INSET = 0.8
/** Lift (mm) of overlays above the printed face. */
const LIFT_REGION = 0.4
const LIFT_PIN = 1
const NO_REGIONS: ClusterRegion[] = []

export interface CartonModelProps {
  geometry: PackGeometry
  /** 0 = flat dieline, 1 = closed box. */
  fold: number
  art?: ArtworkTexture
  xray?: boolean
  findings?: PackFinding[]
  regulated?: PackRegion[]
  missing?: PackRegion[]
  selectedId?: string | null
  onPinClick?: (finding: PackFinding, panel: string) => void
  /** Regions that group crowded findings into one cluster pin (pack zones, printed blocks). */
  clusterRegions?: ClusterRegion[]
  /** Pin passed checks too (off by default: they crowd the box). */
  showPassed?: boolean
  /** A cluster pin was clicked. */
  onClusterClick?: (cluster: PinCluster) => void
  reducedMotion?: boolean
  /** Stable DOM node for pin and box labels (drei Html); keeps labels from remounting. */
  htmlPortal?: RefObject<HTMLElement | null>
}

/** Tree and layout for a geometry at a fold value (shared with the camera rig). */
export function useCartonLayout(geometry: PackGeometry, fold: number): { tree: HingeTree; layout: Layout } {
  const tree = useMemo(() => buildHingeTree(geometry), [geometry])
  const layout = useMemo(() => layoutAt(tree, fold), [tree, fold])
  return { tree, layout }
}

/** Glue flap, dust/tuck flaps, and inner closure flaps fold inside the outer faces. */
export function isInnerPanel(tree: HingeTree, name: string): boolean {
  const h = tree.hinges.get(name)
  if (!h) return false
  if (h.kind === 'dust' || h.kind === 'tuck') return true
  const parent = tree.panels.get(h.parent)!
  const child = tree.panels.get(name)!
  if (h.kind === 'side' && child.w < parent.w * 0.25) return true

  // In a double-flap closure (e.g. cereal carton with two full-depth top flaps),
  // the flap without a tuck flap child is the inner closure flap and sits inside the outer lid.
  if (h.kind === 'lid') {
    const isTop = child.y < parent.y
    const otherLids = [...tree.hinges.values()].filter(
      (other) =>
        other.kind === 'lid' &&
        other.child !== name &&
        (tree.panels.get(other.child)!.y < tree.panels.get(other.parent)!.y) === isTop,
    )
    if (otherLids.length > 0) {
      const hasTuckChild = [...tree.hinges.values()].some((other) => other.kind === 'tuck' && other.parent === name)
      const otherHasTuck = otherLids.some((other) =>
        [...tree.hinges.values()].some((t) => t.kind === 'tuck' && t.parent === other.child),
      )
      if (otherHasTuck && !hasTuckChild) return true
      if (!otherHasTuck && !hasTuckChild && h.parent === 'Back') return true
    }
  }
  return false
}

/** Position + rotation for a panel's frame (centring offset included). */
function panelPose(layout: Layout, name: string): { position: Vector3; quaternion: Quaternion } {
  const m = new Matrix4().makeTranslation(layout.offset.x, layout.offset.y, layout.offset.z).multiply(layout.matrices.get(name)!)
  const position = new Vector3()
  const quaternion = new Quaternion()
  m.decompose(position, quaternion, new Vector3())
  return { position, quaternion }
}

/** A quad in flat-world coordinates with UVs cropped from the page texture. */
function quadGeometry(r: { x: number; y: number; w: number; h: number }, frame: PageFrame | null, z = 0): BufferGeometry {
  const { x, y, w, h } = r
  const g = new BufferGeometry()
  const corners = [
    [x, y],
    [x + w, y],
    [x, y + h],
    [x + w, y + h],
  ]
  g.setAttribute('position', new Float32BufferAttribute(corners.flatMap(([cx, cy]) => flatPoint(cx, cy, z).toArray()), 3))
  if (frame) g.setAttribute('uv', new Float32BufferAttribute(corners.flatMap(([cx, cy]) => pageToUv(frame, cx, cy)), 2))
  g.setIndex([0, 2, 1, 2, 3, 1])
  g.computeVertexNormals()
  return g
}

function outline(r: { x: number; y: number; w: number; h: number }, z: number, material: LineBasicMaterial | LineDashedMaterial): Line {
  const pts = [flatPoint(r.x, r.y, z), flatPoint(r.x + r.w, r.y, z), flatPoint(r.x + r.w, r.y + r.h, z), flatPoint(r.x, r.y + r.h, z), flatPoint(r.x, r.y, z)]
  const line = new Line(new BufferGeometry().setFromPoints(pts), material)
  line.computeLineDistances()
  return line
}

function PanelMesh({ panel, frame, inner, front, back, edge }: { panel: DielinePanel; frame: PageFrame | null; inner: boolean; front: MeshStandardMaterial; back: MeshStandardMaterial; edge: LineBasicMaterial }) {
  const z = inner ? -INNER_INSET : 0
  const geom = useMemo(() => quadGeometry(panel, frame, z), [panel, frame, z])
  const line = useMemo(() => outline(panel, z + 0.05, edge), [panel, z, edge])
  useEffect(() => () => geom.dispose(), [geom])
  useEffect(() => () => line.geometry.dispose(), [line])
  return (
    <>
      <mesh name={`panel:${panel.name}`} geometry={geom} material={front} userData={{ panel: panel.name }} />
      <mesh geometry={geom} material={back} />
      <primitive object={line} />
    </>
  )
}

/**
 * Hide a label whose face is turned away from the camera (exact for a convex box), so
 * labels never show through the box. Writes the DOM directly: no React render per frame.
 */
function useFacingLabel() {
  const anchor = useRef<Group>(null)
  const label = useRef<HTMLElement>(null)
  const tmp = useMemo(() => ({ n: new Vector3(), p: new Vector3(), q: new Quaternion(), c: new Vector3() }), [])
  useFrame(({ camera }) => {
    const g = anchor.current
    const el = label.current
    if (!g || !el) return
    g.getWorldPosition(tmp.p)
    g.getWorldQuaternion(tmp.q)
    tmp.n.set(0, 0, 1).applyQuaternion(tmp.q)
    const facing = tmp.n.dot(tmp.c.copy(camera.position).sub(tmp.p)) > 0
    if (el.dataset.facing !== String(facing)) {
      el.dataset.facing = String(facing)
      el.style.opacity = facing ? '1' : '0'
      el.style.visibility = facing ? 'visible' : 'hidden'
    }
  })
  return { anchor, label }
}

interface PinProps {
  finding: PackFinding
  selected: boolean
  /** Show the full label: only the hovered pin, else the selected one, does (one label at a time). */
  expanded: boolean
  onHover: (on: boolean) => void
  onClick?: () => void
  portal?: RefObject<HTMLElement | null>
}

function Pin({ finding, selected, expanded, onHover, onClick, portal }: PinProps) {
  const meta = SEVERITY_META[finding.severity]
  const { anchor, label } = useFacingLabel()
  const { Icon } = meta
  const showFull = expanded

  return (
    <group ref={anchor} position={flatPoint(finding.x, finding.y, LIFT_PIN)}>
      <mesh
        name={`pin:${finding.id}`}
        userData={{ findingId: finding.id, severity: finding.severity }}
        onPointerOver={() => onHover(true)}
        onPointerOut={() => onHover(false)}
        onClick={onClick}
      >
        <circleGeometry args={[selected ? 4.5 : 3.5, 24]} />
        <meshBasicMaterial color={meta.hex} />
      </mesh>
      <Html center zIndexRange={[selected ? 50 : expanded ? 40 : 10, 0]} portal={portal as RefObject<HTMLElement> | undefined}>
        <div
          ref={label as RefObject<HTMLDivElement>}
          className="transition-all duration-150 ease-out"
          onMouseEnter={() => onHover(true)}
          onMouseLeave={() => onHover(false)}
        >
          {showFull ? (
            <button
              type="button"
              onClick={onClick}
              aria-pressed={selected}
              aria-label={`${meta.word}: ${finding.label}`}
              title={finding.label}
              className={`flex max-w-[240px] -translate-y-5 items-center gap-1.5 whitespace-nowrap rounded-chip border bg-surface px-2.5 py-1 text-[12px] font-medium shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info ${meta.cls} ${selected ? 'border-2 border-accent ring-2 ring-accent/20' : ''}`}
            >
              <Icon size={14} aria-hidden="true" strokeWidth={2} />
              <span className="font-semibold">{meta.word}</span>
              <span className="truncate font-normal text-ink">{finding.label}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onClick}
              aria-pressed={selected}
              aria-label={`${meta.word}: ${finding.label}`}
              title={finding.label}
              className={`flex h-5 w-5 -translate-y-2.5 items-center justify-center rounded-full border bg-surface shadow-sm transition-transform hover:scale-125 focus-visible:outline-2 focus-visible:outline-info ${meta.cls}`}
            >
              <Icon size={11} aria-hidden="true" strokeWidth={2.5} />
            </button>
          )}
        </div>
      </Html>
    </group>
  )
}

export interface ClusterLabelProps {
  cluster: PinCluster
  /** The member card is open (the cluster is hovered, or selected with nothing else hovered). */
  expanded: boolean
  selected: boolean
  /** The member currently selected, if any. */
  selectedId?: string | null
  onClick?: () => void
  onMember?: (finding: PackFinding) => void
}

/** The DOM part of a cluster pin: a count badge in the worst severity, and when open a card of its findings. */
interface Rect {
  top: number
  bottom: number
  left: number
  right: number
}

/**
 * Which way a card opens from its pin so it stays inside the view: below and to the right by default;
 * above when it would run off the bottom and there is more room above; to the left likewise.
 */
export function cardPlacement(anchor: Rect, size: { width: number; height: number }, bounds: Rect): { up: boolean; left: boolean } {
  const up = anchor.bottom + size.height > bounds.bottom && anchor.top - bounds.top > bounds.bottom - anchor.bottom
  const left = anchor.left + size.width > bounds.right && anchor.right - bounds.left > bounds.right - anchor.left
  return { up, left }
}

export function ClusterLabel({ cluster, expanded, selected, selectedId, onClick, onMember }: ClusterLabelProps) {
  const meta = SEVERITY_META[cluster.worst]
  const { Icon } = meta
  const card = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState({ up: false, left: false })
  // Measure once the card is open, against the 3D view's label layer (or the window).
  useLayoutEffect(() => {
    const el = card.current
    if (!el) return
    const measure = () => {
      const host = el.closest('[data-label-bounds]')
      const bounds = host ? host.getBoundingClientRect() : { top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth }
      const anchor = (el.parentElement ?? el).getBoundingClientRect()
      const r = el.getBoundingClientRect()
      const next = cardPlacement(anchor, { width: r.width, height: r.height }, bounds)
      setPlace((p) => (p.up === next.up && p.left === next.left ? p : next))
    }
    measure()
    const raf = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(raf)
  }, [expanded, cluster.id])
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        aria-expanded={expanded}
        aria-pressed={selected}
        aria-label={cluster.name}
        title={cluster.name}
        className={`flex h-7 -translate-y-3 items-center gap-1 whitespace-nowrap rounded-full border-2 bg-surface px-2 text-[12px] font-semibold shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info ${meta.cls} ${selected ? 'ring-2 ring-accent/30' : ''}`}
      >
        <Icon size={13} aria-hidden="true" strokeWidth={2.5} />
        <span className="font-mono tabular-nums">{cluster.members.length}</span>
        {expanded && <span className="font-medium text-ink">{cluster.label}</span>}
      </button>
      {expanded && (
        <div
          ref={card}
          role="group"
          aria-label={`${cluster.name}, the list`}
          data-flip={[place.up ? 'up' : 'down', place.left ? 'left' : 'right'].join(' ')}
          className={`absolute z-10 w-[300px] rounded-card border border-border bg-surface p-2 text-left shadow-lg ${place.up ? 'bottom-4' : 'top-4'} ${place.left ? 'right-3' : 'left-3'}`}
        >
          <p className="px-1 pb-1 text-[12px] font-semibold text-ink">{cluster.name}</p>
          <ul className="flex max-h-[240px] flex-col gap-1 overflow-y-auto">
            {cluster.members.map((f) => {
              const m = SEVERITY_META[f.severity]
              const current = selectedId === f.id
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => onMember?.(f)}
                    aria-label={`${m.word}: ${f.label}`}
                    aria-current={current ? 'true' : undefined}
                    className={`flex w-full items-start gap-1.5 rounded-chip border px-2 py-1 text-left text-[12px] hover:bg-bg focus-visible:outline-2 focus-visible:outline-info ${current ? 'border-ink' : 'border-transparent'}`}
                  >
                    <span className={`inline-flex shrink-0 items-center gap-1 font-medium ${m.cls.split(' ')[0]}`}>
                      <m.Icon size={13} aria-hidden="true" /> {m.word}
                    </span>
                    <span className="text-ink">{f.label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

interface ClusterPinProps extends ClusterLabelProps {
  onHover: (on: boolean) => void
  portal?: RefObject<HTMLElement | null>
}

function ClusterPin({ cluster, expanded, selected, selectedId, onClick, onMember, onHover, portal }: ClusterPinProps) {
  const meta = SEVERITY_META[cluster.worst]
  const { anchor, label } = useFacingLabel()
  return (
    <group ref={anchor} position={flatPoint(cluster.x, cluster.y, LIFT_PIN)}>
      <mesh
        name={`pin:${cluster.id}`}
        userData={{ clusterId: cluster.id, count: cluster.members.length, severity: cluster.worst, label: cluster.name, members: cluster.members.map((f) => f.id) }}
        onPointerOver={() => onHover(true)}
        onPointerOut={() => onHover(false)}
        onClick={onClick}
      >
        <circleGeometry args={[selected ? 6.5 : 5.5, 32]} />
        <meshBasicMaterial color={meta.hex} />
      </mesh>
      <Html center zIndexRange={[expanded ? 60 : 20, 0]} portal={portal as RefObject<HTMLElement> | undefined}>
        <div ref={label as RefObject<HTMLDivElement>} className="transition-opacity duration-200 ease-out" onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}>
          <ClusterLabel cluster={cluster} expanded={expanded} selected={selected} selectedId={selectedId} onClick={onClick} onMember={onMember} />
        </div>
      </Html>
    </group>
  )
}

function RegionBox({ region, kind, portal }: { region: PackRegion; kind: 'regulated' | 'missing'; portal?: RefObject<HTMLElement | null> }) {
  const meta = kind === 'missing' ? MISSING_META : REGULATED_META
  const fill = useMemo(() => quadGeometry(region, null, LIFT_REGION), [region])
  const line = useMemo(
    () =>
      outline(
        region,
        LIFT_REGION + 0.05,
        kind === 'missing'
          ? new LineDashedMaterial({ color: meta.hex, dashSize: 3, gapSize: 2 })
          : new LineBasicMaterial({ color: meta.hex }),
      ),
    [region, kind, meta.hex],
  )
  useEffect(() => () => fill.dispose(), [fill])
  useEffect(() => () => line.geometry.dispose(), [line])
  const { anchor, label } = useFacingLabel()
  const { Icon } = meta
  return (
    <group ref={anchor} name={`${kind === 'missing' ? 'ghost' : 'regulated'}:${region.label}`} userData={{ panel: region.panel, kind }}>
      {kind === 'regulated' && (
        <mesh geometry={fill}>
          <meshBasicMaterial color={meta.hex} transparent opacity={0.22} depthWrite={false} />
        </mesh>
      )}
      <primitive object={line} />
      <Html position={flatPoint(region.x + region.w / 2, region.y + region.h / 2, LIFT_REGION)} center zIndexRange={[10, 0]} portal={portal as RefObject<HTMLElement> | undefined}>
        <span
          ref={label}
          className={`pointer-events-none inline-flex items-center gap-1 whitespace-nowrap rounded-chip bg-surface/90 px-1.5 py-0.5 text-[12px] font-medium ${kind === 'missing' ? 'border border-dashed border-warn text-warn' : 'text-info'}`}
        >
          <Icon size={12} aria-hidden="true" strokeWidth={2} />
          {kind === 'missing' ? `Missing: ${region.label}` : region.label}
        </span>
      </Html>
    </group>
  )
}

/**
 * The carton: every panel a quad hinged to its neighbour on the crease line. `fold` 0→1
 * turns every hinge 0°→90° (sides, then dust flaps, then lid and tuck). Pins and X-ray
 * boxes live in their panel's frame, so they ride the fold.
 */
export function CartonModel({
  geometry,
  fold,
  art,
  xray = false,
  findings = [],
  regulated = [],
  missing = [],
  selectedId,
  onPinClick,
  clusterRegions = NO_REGIONS,
  showPassed = false,
  onClusterClick,
  reducedMotion,
  htmlPortal,
}: CartonModelProps) {
  const { tree, layout } = useCartonLayout(geometry, fold)
  const texture = art?.texture ?? null
  const frame = texture ? (art?.frame ?? null) : null

  const front = useMemo(() => new MeshStandardMaterial({ color: TOKEN_HEX.surface, roughness: 0.85, metalness: 0, side: FrontSide, transparent: true }), [])
  const back = useMemo(() => new MeshStandardMaterial({ color: TOKEN_HEX.board, roughness: 0.95, metalness: 0, side: BackSide, transparent: true }), [])
  const edge = useMemo(() => new LineBasicMaterial({ color: TOKEN_HEX.ink2, transparent: true, opacity: 0.45 }), [])
  useEffect(() => {
    front.map = texture
    front.needsUpdate = true
  }, [front, texture])
  useEffect(() => () => [front, back, edge].forEach((m) => m.dispose()), [front, back, edge])

  // X-ray: fade the artwork out (about 250 ms, ease-out), or jump with reduced motion.
  useFrame((_, dt) => {
    const target = xray ? 0.12 : 1
    const k = reducedMotion ? 1 : 1 - Math.exp(-dt / 0.07)
    for (const m of [front, back]) {
      m.opacity += (target - m.opacity) * k
      if (Math.abs(target - m.opacity) < 0.002) m.opacity = target
      m.depthWrite = m.opacity > 0.99
    }
  })

  const groups = useMemo(() => pinGroups(findings, geometry.panels, clusterRegions, showPassed), [findings, geometry.panels, clusterRegions, showPassed])
  // One floating label at a time: the hovered pin's, else the selected one's.
  const [hover, setHover] = useState<string | null>(null)
  const selectedCluster = groups.clusters.find((c) => c.id === selectedId || c.members.some((f) => f.id === selectedId))
  const active = hover ?? selectedCluster?.id ?? selectedId ?? null
  const hoverFor = (id: string) => (on: boolean) => setHover((h) => (on ? id : h === id ? null : h))
  const byPanel = (items: PackRegion[], name: string) =>
    items.filter((r) => panelFor(geometry.panels, r.panel, r.x + r.w / 2, r.y + r.h / 2)?.name === name)

  return (
    <group name="carton">
      {tree.order.concat(tree.loose).map((name) => {
        const panel = tree.panels.get(name)!
        const pose = panelPose(layout, name)
        return (
          <group key={name} name={`face:${name}`} position={pose.position} quaternion={pose.quaternion}>
            <PanelMesh panel={panel} frame={frame} inner={isInnerPanel(tree, name)} front={front} back={back} edge={edge} />
            {groups.singles
              .filter((p) => p.panel === name)
              .map(({ finding }) => (
                <Pin
                  key={finding.id}
                  finding={finding}
                  selected={finding.id === selectedId}
                  expanded={active === finding.id}
                  onHover={hoverFor(finding.id)}
                  onClick={() => onPinClick?.(finding, name)}
                  portal={htmlPortal}
                />
              ))}
            {groups.clusters
              .filter((c) => c.panel === name)
              .map((c) => (
                <ClusterPin
                  key={c.key}
                  cluster={c}
                  selected={selectedCluster?.id === c.id}
                  expanded={active === c.id}
                  selectedId={selectedId}
                  onHover={hoverFor(c.id)}
                  onClick={() => onClusterClick?.(c)}
                  onMember={(f) => onPinClick?.(f, name)}
                  portal={htmlPortal}
                />
              ))}
            {xray && byPanel(regulated, name).map((r, i) => <RegionBox key={`r${i}`} region={r} kind="regulated" portal={htmlPortal} />)}
            {xray && byPanel(missing, name).map((r, i) => <RegionBox key={`m${i}`} region={r} kind="missing" portal={htmlPortal} />)}
          </group>
        )
      })}
    </group>
  )
}
