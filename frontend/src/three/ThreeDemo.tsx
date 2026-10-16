import { Camera } from 'lucide-react'
import { useRef, useState } from 'react'
import { DANCING_FISH_PACK, SAMPLE_FINDINGS, SAMPLE_MISSING, SAMPLE_REGULATED } from './fixture'
import { PackView3D, type PackViewHandle } from './PackView3D'

/**
 * Dev route for the 3D Pack View on the Dancing Fish fixture. Uses the carton PDF from
 * /api/files/f-carton/raw when the backend has it, flat colours otherwise.
 */
export default function ThreeDemo() {
  const view = useRef<PackViewHandle>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [shot, setShot] = useState<string | null>(null)
  return (
    <main className="mx-auto flex max-w-[1240px] flex-col gap-4 p-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold text-ink">3D Pack View</h1>
          <p className="text-ink-2">Dancing Fish Granola Berry Crunch, US carton</p>
        </div>
        <button
          type="button"
          onClick={() => setShot(view.current?.snapshot() ?? null)}
          className="inline-flex items-center gap-1.5 rounded-chip bg-accent px-3 py-1.5 font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info"
        >
          <Camera size={16} aria-hidden="true" /> Take snapshot
        </button>
      </header>
      <PackView3D
        ref={view}
        geometry={DANCING_FISH_PACK}
        geometryNote="Fixture dieline, approximate mm. Replaced by /api/pack when it is ready."
        artwork={{ fileId: 'f-carton', page: 1 }}
        findings={SAMPLE_FINDINGS}
        regulated={SAMPLE_REGULATED}
        missing={SAMPLE_MISSING}
        selectedId={selected}
        onSelect={setSelected}
        autoFold
      />
      {shot && (
        <figure className="flex flex-col gap-1">
          <img src={shot} alt="Snapshot of the 3D carton view" className="w-[320px] rounded-card border border-border" />
          <figcaption className="text-[12px] text-ink-2">Snapshot for the brief (PNG)</figcaption>
        </figure>
      )}
    </main>
  )
}
