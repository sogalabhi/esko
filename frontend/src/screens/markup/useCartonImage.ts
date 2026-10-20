import { usePageImage } from '../../lib/pageImage'
import type { SkippedItem } from '../../types/project'

export type CartonImage =
  | { status: 'off' }
  | { status: 'loading' }
  | { status: 'ready'; url: string; w: number; h: number }
  | { status: 'error'; reason: string }

/**
 * Guide layers the backend ignored while reading (e.g. dimension text), named in file.skipped as
 * "guide layer 'NAME'". The contract has no field for them yet, so they are read from that wording.
 * The backend switches them off when it draws the page; this only names them.
 */
export function guideLayers(skipped: SkippedItem[]): string[] {
  const names = new Set<string>()
  for (const s of skipped) for (const m of `${s.item} ${s.reason}`.matchAll(/guide layer '([^']+)'/g)) names.add(m[1])
  return [...names]
}

/**
 * Page 1 of the pack PDF as an image plus the page size in mm, so marks in mm can sit in the same frame.
 * The backend draws it once (guide layers already off) and every screen shares that one download.
 */
export function useCartonImage(fileId: string | null, enabled: boolean, attempt = 0): CartonImage {
  return usePageImage(fileId, enabled, attempt)
}
