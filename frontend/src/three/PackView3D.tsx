import { CameraControls } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { Box, CircleDashed, FileWarning, Image as ImageIcon, PanelsTopLeft, RotateCcw, ScanEye, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref, type RefObject } from 'react'
import { prefersReducedMotion } from '../lib/motion'
import { useArtwork, type ArtworkTexture } from './artwork'
import { faceView, homeView, type CameraView } from './camera'
import { CartonModel, useCartonLayout } from './CartonModel'
import { placePins } from './geometry'
import { MISSING_META, REGULATED_META, SEVERITY_META } from './meta'
import type { PackArtwork, PackFinding, PackGeometry, PackRegion } from './types'
import { webglAvailable } from './webgl'

/** Full fold time (UI and PLAN: the box folds itself in about 3 s). */
export const FOLD_MS = 3000
const FOV = 35

export interface PackViewHandle {
  /** PNG data URL of the current view (pins drawn as dots; labels are DOM and not included). */
  snapshot(): string | null
  resetView(): void
  flyTo(panel: string): void
  /** Animate the fold to a value (0 flat, 1 closed). */
  foldTo(value: number): void
}

export interface PackView3DProps {
  /** The dieline from /api/pack. null while it loads. */
  geometry: PackGeometry | null
  loading?: boolean
  /** Plain reason when the pack could not be loaded. */
  error?: string
  onRetry?: () => void
  /** Short note under the toolbar, e.g. that the geometry is a fixture or an estimate. */
  geometryNote?: string
  artwork?: PackArtwork
  findings?: PackFinding[]
  regulated?: PackRegion[]
  missing?: PackRegion[]
  selectedId?: string | null
  onSelect?: (id: string) => void
  /** Fold to the closed box once mounted. */
  autoFold?: boolean
  initialFold?: number
  ref?: Ref<PackViewHandle>
}

interface Rig {
  snapshot(): string | null
  setView(view: CameraView, smooth: boolean): void
}

function useFoldAnimation(initial: number, reduced: boolean) {
  const [fold, setFold] = useState(initial)
  const current = useRef(initial)
  const raf = useRef(0)
  useEffect(() => () => cancelAnimationFrame(raf.current), [])
  const set = useCallback((v: number) => {
    current.current = v
    setFold(v)
  }, [])
  const animateTo = useCallback(
    (target: number) => {
      cancelAnimationFrame(raf.current)
      const from = current.current
      if (reduced || from === target) {
        set(target)
        return
      }
      const duration = FOLD_MS * Math.abs(target - from)
      const start = performance.now()
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration)
        set(from + (target - from) * t)
        if (t < 1) raf.current = requestAnimationFrame(step)
      }
      raf.current = requestAnimationFrame(step)
    },
    [reduced, set],
  )
  const jumpTo = useCallback(
    (v: number) => {
      cancelAnimationFrame(raf.current)
      set(v)
    },
    [set],
  )
  return { fold, animateTo, jumpTo }
}

/** Lives inside the Canvas: owns the camera controls and exposes snapshot + view moves. */
function SceneRig({ rigRef, onReady }: { rigRef: RefObject<Rig | null>; onReady: () => void }) {
  const { gl, scene, camera } = useThree()
  const controls = useRef<CameraControls>(null)
  useEffect(() => {
    rigRef.current = {
      snapshot() {
        gl.render(scene, camera)
        return gl.domElement.toDataURL('image/png')
      },
      setView({ position: p, target: t }, smooth) {
        void controls.current?.setLookAt(p.x, p.y, p.z, t.x, t.y, t.z, smooth)
      },
    }
    onReady()
    return () => {
      rigRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera, rigRef])
  return <CameraControls ref={controls} makeDefault minDistance={120} maxDistance={2000} smoothTime={0.6} />
}

function ArtworkStatus({ art, requested }: { art: ArtworkTexture; requested: boolean }) {
  if (art.status === 'loading')
    return (
      <span className="inline-flex items-center gap-1 text-[12px] text-ink-2" role="status">
        <span aria-hidden="true" className="h-3 w-16 animate-pulse rounded-chip bg-border" />
        Drawing artwork
      </span>
    )
  if (art.status === 'pdf')
    return (
      <span className="inline-flex items-center gap-1 text-[12px] text-ink-2">
        <ImageIcon size={14} aria-hidden="true" /> Artwork from the carton PDF
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-ink-2" title={art.reason}>
      {requested ? <FileWarning size={14} aria-hidden="true" className="text-warn" /> : <PanelsTopLeft size={14} aria-hidden="true" />}
      {requested ? `Flat colours: ${art.reason ?? 'artwork not drawn'}` : 'Flat colours, no artwork file'}
    </span>
  )
}

function Frame({ children }: { children: ReactNode }) {
  return <div className="flex h-[560px] items-center justify-center rounded-card border border-border bg-surface p-6">{children}</div>
}

/**
 * 3D Pack View (UI.md §6.10, PLAN "3D Pack View"): the dieline folds into the box, findings
 * are pins on their exact spot, X-ray shows regulated content and ghost boxes for missing
 * items. Standalone: takes /api/pack geometry and finding locations as props.
 */
export function PackView3D(props: PackView3DProps) {
  const { geometry, loading, error, onRetry } = props
  if (loading || (!geometry && !error))
    return (
      <section aria-label="3D pack view" aria-busy="true" className="flex flex-col gap-3">
        <div className="h-9 w-80 animate-pulse rounded-chip bg-border" />
        <div className="h-[560px] animate-pulse rounded-card bg-border" />
      </section>
    )
  if (error || !geometry)
    return (
      <section aria-label="3D pack view">
        <Frame>
          <div role="alert" className="max-w-md text-center">
            <p className="flex items-center justify-center gap-1 font-medium text-bad">
              <FileWarning size={16} aria-hidden="true" /> The pack could not be loaded
            </p>
            <p className="mt-1 text-ink-2">{error}</p>
            {onRetry && (
              <button type="button" onClick={onRetry} className="mt-3 rounded-chip border border-border px-3 py-1.5 font-medium hover:bg-bg focus-visible:outline-2 focus-visible:outline-info">
                Try again
              </button>
            )}
          </div>
        </Frame>
      </section>
    )
  if (geometry.panels.length === 0)
    return (
      <section aria-label="3D pack view">
        <Frame>
          <p className="text-ink-2">No dieline panels yet. Add the carton PDF on the Evidence step to fold it into a box.</p>
        </Frame>
      </section>
    )
  return <PackView3DReady {...props} geometry={geometry} />
}

function PackView3DReady({ geometry, geometryNote, artwork, findings = [], regulated = [], missing = [], selectedId, onSelect, autoFold, initialFold = 0, ref }: PackView3DProps & { geometry: PackGeometry }) {
  const reduced = useMemo(prefersReducedMotion, [])
  const [webgl, setWebgl] = useState(webglAvailable)
  const [xray, setXray] = useState(false)
  const [localSelected, setLocalSelected] = useState<string | null>(null)
  const selected = selectedId !== undefined ? selectedId : localSelected
  const { fold, animateTo, jumpTo } = useFoldAnimation(initialFold, reduced)
  const { tree, layout } = useCartonLayout(geometry, fold)
  const art = useArtwork(geometry.panels, artwork)
  const rig = useRef<Rig | null>(null)
  const labels = useRef<HTMLDivElement>(null)
  const { placed, unplaced } = useMemo(() => placePins(findings, geometry.panels), [findings, geometry.panels])

  // Latest layout for imperative calls, without re-creating the handle every frame.
  const live = useRef({ tree, layout, fold })
  live.current = { tree, layout, fold }

  const resetView = useCallback(
    (forFold?: number) => {
      const { tree: t, layout: l, fold: f } = live.current
      rig.current?.setView(homeView(t, l, forFold ?? f, FOV), !reduced)
    },
    [reduced],
  )
  const flyTo = useCallback(
    (panel: string) => {
      const { tree: t, layout: l } = live.current
      if (t.panels.has(panel)) rig.current?.setView(faceView(t, l, panel, FOV), !reduced)
    },
    [reduced],
  )
  const foldTo = useCallback(
    (v: number) => {
      animateTo(v)
      // Frame the end state: the folded box sits well inside the flat sheet's view.
      if (v >= 0.5) setTimeout(() => resetView(1), reduced ? 0 : FOLD_MS * 0.55)
      else resetView(0)
    },
    [animateTo, resetView, reduced],
  )

  useImperativeHandle(ref, () => ({ snapshot: () => rig.current?.snapshot() ?? null, resetView: () => resetView(), flyTo, foldTo }), [resetView, flyTo, foldTo])

  // Auto-fold once the artwork is on the faces (or has fallen back to flat colours).
  const autoFolded = useRef(false)
  useEffect(() => {
    if (!autoFold || autoFolded.current || art.status === 'loading') return
    autoFolded.current = true
    foldTo(1)
  }, [autoFold, art.status, foldTo])

  const select = (id: string) => {
    setLocalSelected(id)
    onSelect?.(id)
    const pin = placed.find((p) => p.finding.id === id)
    if (pin) flyTo(pin.panel)
  }

  // An outside selection (e.g. from a list elsewhere) also flies the camera.
  useEffect(() => {
    if (!selectedId) return
    const pin = placed.find((p) => p.finding.id === selectedId)
    if (pin) flyTo(pin.panel)
  }, [selectedId, placed, flyTo])

  const folded = fold >= 0.999
  const btn =
    'inline-flex items-center gap-1.5 rounded-chip border border-border bg-surface px-3 py-1.5 text-[14px] font-medium text-ink hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info disabled:opacity-50'

  return (
    <section aria-label="3D pack view" className="flex flex-col gap-3">
      <div role="toolbar" aria-label="3D view controls" className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn} onClick={() => foldTo(folded ? 0 : 1)}>
          {folded ? <PanelsTopLeft size={16} aria-hidden="true" /> : <Box size={16} aria-hidden="true" />}
          {folded ? 'Unfold' : 'Fold box'}
        </button>
        <label className="inline-flex items-center gap-2 text-[14px] text-ink-2">
          Fold
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(fold * 100)}
            onChange={(e) => jumpTo(Number(e.target.value) / 100)}
            className="w-32 accent-[var(--accent)]"
          />
          <output className="w-10 font-mono tabular-nums text-ink">{Math.round(fold * 100)}%</output>
        </label>
        <button type="button" className={`${btn} ${xray ? 'border-info text-info' : ''}`} aria-pressed={xray} onClick={() => setXray((v) => !v)}>
          <ScanEye size={16} aria-hidden="true" />
          X-ray {xray ? 'on' : 'off'}
        </button>
        <button type="button" className={btn} onClick={() => resetView()} disabled={!webgl}>
          <RotateCcw size={16} aria-hidden="true" />
          Reset view
        </button>
        <span className="ml-auto">
          <ArtworkStatus art={art} requested={Boolean(artwork)} />
        </span>
      </div>
      {geometryNote && <p className="-mt-1 text-[12px] text-ink-2">{geometryNote}</p>}

      <div className="grid grid-cols-[minmax(0,1fr)_260px] gap-4">
        {webgl ? (
          <div className="relative h-[560px] overflow-hidden rounded-card border border-border bg-bg" data-testid="pack-canvas">
            <div ref={labels} className="pointer-events-none absolute inset-0 z-10 [&>*]:pointer-events-auto" />
            <Canvas
              flat
              dpr={[1, 2]}
              camera={{ position: [0, 0, 900], fov: FOV, near: 1, far: 6000 }}
              gl={{ preserveDrawingBuffer: true, antialias: true }}
              aria-label="Carton in 3D. Drag to orbit, scroll to zoom."
            >
              <color attach="background" args={['#fafaf7']} />
              <ambientLight intensity={1.6} />
              <directionalLight position={[300, 500, 600]} intensity={1.4} />
              <directionalLight position={[-400, -200, -300]} intensity={0.5} />
              <CartonModel
                geometry={geometry}
                fold={fold}
                art={art}
                xray={xray}
                findings={findings}
                regulated={regulated}
                missing={missing}
                selectedId={selected}
                onPinClick={(f) => select(f.id)}
                reducedMotion={reduced}
                htmlPortal={labels}
              />
              <SceneRig rigRef={rig} onReady={() => resetView()} />
            </Canvas>
          </div>
        ) : (
          <Frame>
            <div role="alert" className="max-w-md text-center">
              <p className="flex items-center justify-center gap-1 font-medium text-bad">
                <FileWarning size={16} aria-hidden="true" /> 3D view unavailable
              </p>
              <p className="mt-1 text-ink-2">This browser has WebGL switched off, so the box cannot be drawn. The findings are listed beside this frame.</p>
              <button type="button" className={`${btn} mt-3`} onClick={() => setWebgl(webglAvailable())}>
                Try again
              </button>
            </div>
          </Frame>
        )}

        <aside aria-label="Findings on the box" className="flex max-h-[560px] flex-col gap-3 overflow-y-auto">
          {xray && (
            <div aria-label="X-ray legend" className="flex flex-col gap-1 border-b border-border pb-2 text-[12px]">
              <span className="inline-flex items-center gap-1 text-info">
                <ShieldCheck size={14} aria-hidden="true" /> {REGULATED_META.word} content <span className="font-mono">{regulated.length}</span>
              </span>
              <span className="inline-flex items-center gap-1 text-warn">
                <CircleDashed size={14} aria-hidden="true" /> {MISSING_META.word}, ghost box <span className="font-mono">{missing.length}</span>
              </span>
              <ul className="pl-5 text-ink-2">
                {missing.map((m, i) => (
                  <li key={i}>
                    {m.label} · {m.panel}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <h2 className="text-[14px] font-semibold text-ink">
            Findings on the box <span className="font-mono text-ink-2">{placed.length}</span>
          </h2>
          {findings.length === 0 && <p className="text-ink-2">No findings to pin.</p>}
          <ul className="flex flex-col gap-1.5">
            {placed.map(({ finding: f, panel }) => {
              const meta = SEVERITY_META[f.severity]
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => select(f.id)}
                    aria-current={selected === f.id ? 'true' : undefined}
                    className={`flex w-full flex-col items-start gap-0.5 rounded-chip border bg-surface px-2.5 py-2 text-left hover:bg-bg focus-visible:outline-2 focus-visible:outline-info ${selected === f.id ? 'border-ink' : 'border-border'}`}
                  >
                    <span className={`inline-flex items-center gap-1 text-[12px] font-medium ${meta.cls.split(' ')[0]}`}>
                      <meta.Icon size={14} aria-hidden="true" /> {meta.word}
                    </span>
                    <span className="text-[14px] text-ink">{f.label}</span>
                    <span className="text-[12px] text-ink-2">{panel}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          {unplaced.length > 0 && (
            <div>
              <h3 className="text-[12px] font-semibold text-warn">Not on a panel ({unplaced.length})</h3>
              <ul className="text-[12px] text-ink-2">
                {unplaced.map((f) => (
                  <li key={f.id}>
                    {SEVERITY_META[f.severity].word}: {f.label} (panel “{f.panel}” is not on this dieline)
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </section>
  )
}
