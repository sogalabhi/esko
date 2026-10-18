import type { Requirement } from '../types/project'
import type { PackRegion } from './types'

/** A block the fit engine placed on the pack (/api/pack blocks, or project.pack.blocks). */
export interface SlotBlock {
  item: string
  label?: string
  panel: string
  x: number
  y: number
  w: number
  h: number
  state?: string
  /** Requirement items the block carries. */
  covers?: string[]
}

/** "allergen_declaration" → "Allergen declaration"; a label that is already words stays as it is. */
export function itemLabel(item: string): string {
  if (!/_/.test(item)) return item
  const s = item.replace(/_/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Required items missing from the pack. Each goes where the fit engine put it, if it found a slot;
 * otherwise it is only listed. A position is never made up.
 */
export function placeMissing(requirements: Requirement[], blocks: SlotBlock[]): { ghosts: PackRegion[]; unslotted: string[] } {
  const ghosts: PackRegion[] = []
  const unslotted: string[] = []
  const seen = new Set<string>()
  for (const r of requirements) {
    if (r.status !== 'missing' || seen.has(r.item)) continue
    seen.add(r.item)
    const b = blocks.find((x) => (x.item === r.item || x.covers?.includes(r.item)) && x.state !== 'overflow' && x.w > 0 && x.h > 0)
    if (b) ghosts.push({ panel: b.panel, x: b.x, y: b.y, w: b.w, h: b.h, label: b.label ?? itemLabel(r.item) })
    else unslotted.push(itemLabel(r.item))
  }
  return { ghosts, unslotted }
}
