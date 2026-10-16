import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
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
import { buildHingeTree, flatPoint, layoutAt, pageToUv, panelFor, placePins, type HingeTree, type Layout, type PageFrame } from './geometry'
import { MISSING_META, REGULATED_META, SEVERITY_META, TOKEN_HEX } from './meta'
import type { DielinePanel, PackFinding, PackGeometry, PackRegion } from './types'

/** How far (mm) inner flaps sit inside the outer faces, so they never z-fight. */
const INNER_INSET = 0.8
/** Lift (mm) of overlays above the printed face. */
const LIFT_REGION = 0.4
const LIFT_PIN = 1

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

/** Glue flap and dust/tuck flaps fold inside the outer faces. */
export function isInnerPanel(tree: HingeTree, name: string): boolean {
  const h = tree.hinges.get(name)
  if (!h) return false
  if (h.kind === 'dust' || h.kind === 'tuck') return true
  const parent = tree.panels.get(h.parent)!
  const child = tree.panels.get(name)!
  return h.kind === 'side' && child.w < parent.w * 0.25
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

function Pin({ finding, selected, onClick, portal }: { finding: PackFinding; selected: boolean; onClick?: () => void; portal?: RefObject<HTMLElement | null> }) {
  const meta = SEVERITY_META[finding.severity]
  const { anchor, label } = useFacingLabel()
  const { Icon } = meta
  return (
    <group ref={anchor} position={flatPoint(finding.x, finding.y, LIFT_PIN)}>
      <mesh name={`pin:${finding.id}`} userData={{ findingId: finding.id, severity: finding.severity }}>
        <circleGeometry args={[selected ? 4.5 : 3.5, 24]} />
        <meshBasicMaterial color={meta.hex} />
      </mesh>
      <Html center zIndexRange={[selected ? 30 : 20, 0]} portal={portal as RefObject<HTMLElement> | undefined}>
        <div ref={label as RefObject<HTMLDivElement>} className="transition-opacity duration-200 ease-out">
          <button
            type="button"
            onClick={onClick}
            aria-pressed={selected}
            aria-label={`${meta.word}: ${finding.label}`}
            title={finding.label}
            className={`flex max-w-[220px] -translate-y-5 items-center gap-1 whitespace-nowrap rounded-chip border bg-surface px-2 py-0.5 text-[12px] font-medium shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info ${meta.cls} ${selected ? 'border-2' : ''}`}
          >
            <Icon size={14} aria-hidden="true" strokeWidth={2} />
            <span>{meta.word}</span>
            <span className="truncate font-normal text-ink">{finding.label}</span>
          </button>
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
export function CartonModel({ geometry, fold, art, xray = false, findings = [], regulated = [], missing = [], selectedId, onPinClick, reducedMotion, htmlPortal }: CartonModelProps) {
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

  const pins = useMemo(() => placePins(findings, geometry.panels).placed, [findings, geometry.panels])
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
            {pins
              .filter((p) => p.panel === name)
              .map(({ finding }) => (
                <Pin key={finding.id} finding={finding} selected={finding.id === selectedId} onClick={() => onPinClick?.(finding, name)} portal={htmlPortal} />
              ))}
            {xray && byPanel(regulated, name).map((r, i) => <RegionBox key={`r${i}`} region={r} kind="regulated" portal={htmlPortal} />)}
            {xray && byPanel(missing, name).map((r, i) => <RegionBox key={`m${i}`} region={r} kind="missing" portal={htmlPortal} />)}
          </group>
        )
      })}
    </group>
  )
}
