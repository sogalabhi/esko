/**
 * Inputs to the 3D Pack View. All positions are in page millimetres, the same frame as
 * pack.panels and the conflict / fact locations in UI.md §9 (origin top-left, y down).
 */

/** One panel of the flat dieline. Matches pack.panels in the data contract. */
export interface DielinePanel {
  name: string
  x: number
  y: number
  w: number
  h: number
}

/** A crease line between two panels (the hinge). Shape of /api/pack folds. */
export interface DielineFold {
  a: string
  b: string
  x1: number
  y1: number
  x2: number
  y2: number
}

/** What /api/pack returns: the flat dieline and its crease lines. */
export interface PackGeometry {
  panels: DielinePanel[]
  folds: DielineFold[]
}

/** high / medium / low follow conflict.severity; pass is a check that passed. */
export type PinSeverity = 'high' | 'medium' | 'low' | 'pass'

/** A finding pinned on the box. x, y are page mm; panel names the face it sits on. */
export interface PackFinding {
  id: string
  panel: string
  x: number
  y: number
  severity: PinSeverity
  label: string
}

/** A box on a face: a regulated content block (X-ray) or where a missing item should go. */
export interface PackRegion {
  panel: string
  x: number
  y: number
  w: number
  h: number
  label: string
}

/** The artwork to texture the faces with. Without it the faces get flat colours and names. */
export interface PackArtwork {
  fileId: string
  page?: number
}
