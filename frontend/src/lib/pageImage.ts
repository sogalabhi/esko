import { useEffect, useState } from 'react'
import { api } from '../api/client'

/** Page 1 of a PDF as an image (object URL) plus the page size in mm. */
export interface PageImage {
  url: string
  w: number
  h: number
}

export type PageImageState =
  | { status: 'off' }
  | { status: 'loading' }
  | { status: 'ready'; url: string; w: number; h: number }
  | { status: 'error'; reason: string }

// One request per file id for the whole app: every screen and every crop shares it. A failure is
// dropped from the cache so that the next call (Retry) asks the backend again.
const cache = new Map<string, Promise<PageImage>>()
/** What has already arrived, so a component that mounts later can draw on its first render. */
const arrived = new Map<string, PageImage>()

export function loadPageImage(fileId: string): Promise<PageImage> {
  let p = cache.get(fileId)
  if (!p) {
    p = api.fetchPageImage(fileId).then(({ blob, w, h }) => {
      const img = { url: URL.createObjectURL(blob), w, h }
      arrived.set(fileId, img)
      return img
    })
    cache.set(fileId, p)
    p.catch(() => {
      if (cache.get(fileId) === p) cache.delete(fileId)
    })
  }
  return p
}

/** Forget what was loaded (tests, or when the backend's files change). */
export function clearPageImages(): void {
  cache.clear()
  arrived.clear()
}

export function pageImageReason(e: unknown): string {
  if (e instanceof Error && e.message) {
    const m = e.message.replace(/\.$/, '')
    // Reads after "could not be drawn:", so a plain sentence starts in lower case.
    return /^[A-Z][a-z]/.test(m) ? m[0].toLowerCase() + m.slice(1) : m
  }
  return 'the PDF could not be drawn'
}

/**
 * The shared page image of a file. `attempt` is bumped by a Retry button. Stays 'off' when
 * `enabled` is false (mock data has no backend to ask).
 */
export function usePageImage(fileId: string | null, enabled: boolean, attempt = 0): PageImageState {
  const on = enabled && !!fileId
  const known = on && fileId ? arrived.get(fileId) : undefined
  const [state, setState] = useState<PageImageState>(known ? { status: 'ready', ...known } : { status: on ? 'loading' : 'off' })

  useEffect(() => {
    if (!on || !fileId) {
      setState({ status: 'off' })
      return
    }
    let cancelled = false
    const hit = arrived.get(fileId)
    setState((s) => (hit ? { status: 'ready', ...hit } : s.status === 'loading' ? s : { status: 'loading' }))
    loadPageImage(fileId).then(
      (img) => {
        if (!cancelled) setState({ status: 'ready', ...img })
      },
      (e: unknown) => {
        if (!cancelled) setState({ status: 'error', reason: pageImageReason(e) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [on, fileId, attempt])

  return state
}
