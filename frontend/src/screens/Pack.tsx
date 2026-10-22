import { Camera, Download, RefreshCw, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, type PackOutResponse } from '../api/client'
import { ConflictCard } from '../components/ConflictCard'
import { regionsFromFacts, type ClusterRegion } from '../lib/clusters'
import { packFileId } from '../lib/markup'
import { useProject } from '../state/project'
import { NoPackState } from '../components/NoPackState'
import { DANCING_FISH_PACK, SAMPLE_FINDINGS, SAMPLE_REGULATED } from '../three/fixture'
import { placeMissing, type SlotBlock } from '../three/missing'
import { PackView3D, type PackViewHandle } from '../three/PackView3D'
import type { PackArtwork, PackFinding, PackGeometry, PackRegion } from '../three/types'

export function Pack() {
  const { project, source, openSource, resolveConflict } = useProject()
  const view = useRef<PackViewHandle>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [geometry, setGeometry] = useState<PackGeometry | null>(null)
  const [zones, setZones] = useState<PackOutResponse['zones']>([])
  const [blocks, setBlocks] = useState<SlotBlock[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>()
  /** Live only: the backend has no dieline for this project (404). */
  const [noDieline, setNoDieline] = useState(false)
  const [geometryNote, setGeometryNote] = useState<string | undefined>()
  const [shot, setShot] = useState<string | null>(null)

  const mock = source === 'mock'
  const packId = packFileId(project)

  // Fixtures only in mock mode. A live project shows its own dieline, the empty state, or the error.
  const loadGeometry = useCallback(async () => {
    if (mock) {
      setGeometry(DANCING_FISH_PACK)
      setGeometryNote('Fixture dieline (Dancing Fish Granola). All mm measured from the sample PDF.')
      setError(undefined)
      return
    }
    if (!packId) return
    setLoading(true)
    setError(undefined)
    setNoDieline(false)
    try {
      const pack = await api.getPack()
      if (!pack) {
        setGeometry(null)
        setNoDieline(true)
        return
      }
      setGeometry({ panels: pack.panels, folds: pack.folds })
      setZones(pack.zones ?? [])
      setBlocks(pack.blocks ?? [])
      setGeometryNote(
        pack.folds.length > 0
          ? `Dieline geometry from ${pack.fileId}. ${pack.panels.length} panels, ${pack.folds.length} folds.`
          : `Dieline geometry from ${pack.fileId}. ${pack.panels.length} panels; no crease lines were found, so it stays flat.`,
      )
    } catch (e) {
      setGeometry(null)
      setError(e instanceof Error ? e.message : 'Could not load the pack geometry from the backend.')
    } finally {
      setLoading(false)
    }
  }, [mock, packId])

  useEffect(() => {
    void loadGeometry()
  }, [loadGeometry])

  const findings: PackFinding[] = useMemo(() => {
    const list: PackFinding[] = []
    for (const c of project.conflicts) {
      if (c.resolution) continue
      const loc = c.locations.find((l) => (packId ? l.fileId === packId : true) && l.panel) ?? c.locations[0]
      if (loc && loc.panel) {
        list.push({
          id: c.id,
          panel: loc.panel,
          x: loc.x + (loc.w ? loc.w / 2 : 0),
          y: loc.y + (loc.h ? loc.h / 2 : 0),
          severity: c.severity,
          label: c.explanation,
          // A finding that links several places on the pack keeps its own pin (as on the 2D markup).
          solo: c.locations.filter((l) => (packId ? l.fileId === packId : true)).length > 1,
        })
      }
    }
    for (const f of project.facts) {
      if (f.state === 'pass') {
        const src = f.sources.find((s) => (packId ? s.fileId === packId : true) && s.where.panel)
        if (src?.where.panel && src.where.bbox) {
          list.push({
            id: `fact-${f.id}`,
            panel: src.where.panel,
            x: src.where.bbox[0] + src.where.bbox[2] / 2,
            y: src.where.bbox[1] + src.where.bbox[3] / 2,
            severity: 'pass',
            label: `${f.field}: ${f.value ?? 'pass'}`,
          })
        }
      }
    }
    return list.length > 0 || !mock ? list : SAMPLE_FINDINGS
  }, [project.conflicts, project.facts, packId, mock])

  const regulated: PackRegion[] = useMemo(
    () => (mock ? SAMPLE_REGULATED : zones.map((z) => ({ panel: z.panel, x: z.x, y: z.y, w: z.w, h: z.h, label: z.label }))),
    [mock, zones],
  )

  // What groups crowded findings into one pin: the pack zones and the blocks the facts are printed in.
  // The same regions the 2D markup uses.
  const clusterRegions: ClusterRegion[] = useMemo(
    () => [...regulated, ...(packId ? regionsFromFacts(project.facts, packId) : [])],
    [regulated, project.facts, packId],
  )

  // Missing items go where the fit engine put them; without a slot they are only listed.
  const { ghosts: missing, unslotted } = useMemo(
    () => placeMissing(project.requirements, mock ? project.pack.blocks : blocks),
    [project.requirements, project.pack.blocks, blocks, mock],
  )

  const artwork: PackArtwork | undefined = useMemo(() => (packId ? { fileId: packId, page: 1 } : undefined), [packId])

  const onSelectFinding = useCallback(
    (id: string) => {
      setSelectedId(id)
      const conflict = project.conflicts.find((c) => c.id === id)
      if (conflict) {
        const src = conflict.right.sources[0] ?? conflict.left.sources[0]
        if (src) openSource(src)
        return
      }
      const fact = project.facts.find((f) => `fact-${f.id}` === id || f.id === id)
      if (fact && fact.sources[0]) {
        openSource(fact.sources[0])
      }
    },
    [project.conflicts, project.facts, openSource],
  )

  const selectedConflict = project.conflicts.find((c) => c.id === selectedId)

  // New-product mode: no old pack, so nothing to draw (PLAN "Two modes").
  if (!mock && (!packId || noDieline)) return <NoPackState />

  return (
    <main className="mx-auto flex max-w-[1240px] flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold text-ink">Pack (3D View)</h1>
          <p className="mt-0.5 text-[14px] text-ink-2">
            Fold the carton into 3D, inspect compliance findings pinned on each panel face, and view X-ray zones.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadGeometry()}
            className="inline-flex items-center gap-1.5 rounded-chip border border-border bg-surface px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-bg focus-visible:outline-2 focus-visible:outline-info"
            title="Reload pack geometry"
          >
            <RefreshCw size={14} aria-hidden="true" /> Refresh geometry
          </button>
          <button
            type="button"
            onClick={() => setShot(view.current?.snapshot() ?? null)}
            className="inline-flex items-center gap-1.5 rounded-chip bg-accent px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info"
          >
            <Camera size={15} aria-hidden="true" /> Take 3D snapshot
          </button>
        </div>
      </header>

      {shot && (
        <aside
          role="region"
          aria-label="3D snapshot preview"
          className="flex flex-col gap-2 rounded-card border border-accent/30 bg-accent/5 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-3">
            <img src={shot} alt="Snapshot of the 3D carton" className="h-16 w-24 rounded border border-border object-cover" />
            <div>
              <p className="font-medium text-ink">3D Pack Snapshot captured</p>
              <p className="text-[12px] text-ink-2">High-res PNG snapshot ready for export or the approval report.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={shot}
              download="pack-3d-snapshot.png"
              className="inline-flex items-center gap-1.5 rounded-chip bg-surface px-3 py-1.5 text-[13px] font-medium text-ink border border-border hover:bg-bg"
            >
              <Download size={14} aria-hidden="true" /> Download PNG
            </a>
            <button
              type="button"
              onClick={() => setShot(null)}
              className="rounded-chip p-1.5 text-ink-2 hover:bg-surface hover:text-ink"
              aria-label="Dismiss snapshot"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </aside>
      )}

      <PackView3D
        ref={view}
        geometry={geometry}
        loading={loading}
        error={error}
        onRetry={() => void loadGeometry()}
        geometryNote={geometryNote}
        artwork={artwork}
        findings={findings}
        regulated={regulated}
        missing={missing}
        unslotted={unslotted}
        clusterRegions={clusterRegions}
        selectedId={selectedId}
        onSelect={onSelectFinding}
        autoFold
      />

      {selectedConflict && (
        <section aria-label="Selected finding" className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-ink">Selected Finding: {selectedConflict.explanation}</h2>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="text-[12px] text-ink-2 hover:text-ink"
            >
              Close
            </button>
          </div>
          <ConflictCard
            conflict={selectedConflict}
            onResolve={(choice) => resolveConflict(selectedConflict.id, choice)}
          />
        </section>
      )}
    </main>
  )
}

