import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { SAMPLE_REGULATED } from '../three/fixture'
import type { ClusterRegion } from './clusters'

const NONE: ClusterRegion[] = []

/**
 * The labelled zones on the pack, the same source the 3D Pack View uses: /api/pack zones with the
 * backend, the fixture zones in mock mode. A pack that cannot be read gives no zones (clustering then
 * falls back to the printed blocks and distance); it never blocks the screen.
 */
export function usePackZones(mock: boolean, fileId: string | null): ClusterRegion[] {
  const [loaded, setLoaded] = useState<{ fileId: string; zones: ClusterRegion[] } | null>(null)
  useEffect(() => {
    if (mock || !fileId) return
    let live = true
    api
      .getPack()
      .then((p) => {
        if (live) setLoaded({ fileId, zones: (p?.zones ?? []).map((z) => ({ panel: z.panel, x: z.x, y: z.y, w: z.w, h: z.h, label: z.label })) })
      })
      .catch(() => {
        if (live) setLoaded({ fileId, zones: NONE })
      })
    return () => {
      live = false
    }
  }, [mock, fileId])
  if (mock) return SAMPLE_REGULATED
  return loaded && loaded.fileId === fileId ? loaded.zones : NONE
}
