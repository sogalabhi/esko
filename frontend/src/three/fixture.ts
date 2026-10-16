import type { PackFinding, PackGeometry, PackRegion } from './types'

/**
 * Stand-in for /api/pack until it lands: Esko's Dancing Fish tuck-end carton, approximate mm.
 * Main row y141–300 (Back, Right, Front, Left), glue flap left of Back, lid on Back, bottom
 * tuck on Front, dust flaps on both sides. Sizes are rounded so the box closes.
 */
export const DANCING_FISH_PACK: PackGeometry = {
  panels: [
    { name: 'Glue flap', x: 0, y: 147, w: 15, h: 147 },
    { name: 'Back', x: 15, y: 141, w: 141, h: 159 },
    { name: 'Right', x: 156, y: 141, w: 80, h: 159 },
    { name: 'Front', x: 236, y: 141, w: 141, h: 159 },
    { name: 'Left', x: 377, y: 141, w: 80, h: 159 },
    { name: 'Top flap · Back', x: 15, y: 60, w: 141, h: 81 },
    { name: 'Top dust · Right', x: 158, y: 100, w: 76, h: 41 },
    { name: 'Top dust · Left', x: 379, y: 100, w: 76, h: 41 },
    { name: 'Bottom flap · Front', x: 236, y: 300, w: 141, h: 80 },
    { name: 'Bottom dust · Right', x: 158, y: 300, w: 76, h: 41 },
    { name: 'Bottom dust · Left', x: 379, y: 300, w: 76, h: 41 },
  ],
  folds: [
    { a: 'Glue flap', b: 'Back', x1: 15, y1: 147, x2: 15, y2: 294 },
    { a: 'Back', b: 'Right', x1: 156, y1: 141, x2: 156, y2: 300 },
    { a: 'Right', b: 'Front', x1: 236, y1: 141, x2: 236, y2: 300 },
    { a: 'Front', b: 'Left', x1: 377, y1: 141, x2: 377, y2: 300 },
    { a: 'Back', b: 'Top flap · Back', x1: 15, y1: 141, x2: 156, y2: 141 },
    { a: 'Right', b: 'Top dust · Right', x1: 158, y1: 141, x2: 234, y2: 141 },
    { a: 'Left', b: 'Top dust · Left', x1: 379, y1: 141, x2: 455, y2: 141 },
    { a: 'Front', b: 'Bottom flap · Front', x1: 236, y1: 300, x2: 377, y2: 300 },
    { a: 'Right', b: 'Bottom dust · Right', x1: 158, y1: 300, x2: 234, y2: 300 },
    { a: 'Left', b: 'Bottom dust · Left', x1: 379, y1: 300, x2: 455, y2: 300 },
  ],
}

/** Sample findings for the demo route (positions follow the mock project's sources). */
export const SAMPLE_FINDINGS: PackFinding[] = [
  { id: 'c-honey', panel: 'Back', x: 60, y: 205, severity: 'medium', label: 'Honey 1% here, 9% on the sheet' },
  { id: 'c-vegan', panel: 'Front', x: 353, y: 276, severity: 'high', label: 'Certified Vegan mark, but honey is an ingredient' },
  { id: 'c-nas', panel: 'Top flap · Back', x: 85, y: 100, severity: 'high', label: 'NO ADDED SUGAR, but honey and coconut sugar are added' },
  { id: 'c-nfp', panel: 'Left', x: 417, y: 220, severity: 'high', label: 'Nutrition Facts: daily values wrong' },
  { id: 'c-barcode', panel: 'Back', x: 120, y: 280, severity: 'pass', label: 'Barcode check digit valid' },
]

/** Regulated content blocks shown in X-ray. */
export const SAMPLE_REGULATED: PackRegion[] = [
  { panel: 'Left', x: 384, y: 150, w: 66, h: 130, label: 'Nutrition Facts' },
  { panel: 'Back', x: 22, y: 190, w: 90, h: 40, label: 'Ingredients and allergens' },
  { panel: 'Back', x: 100, y: 268, w: 44, h: 26, label: 'Barcode' },
  { panel: 'Front', x: 246, y: 280, w: 60, h: 14, label: 'Net quantity (g)' },
  { panel: 'Front', x: 338, y: 262, w: 30, h: 28, label: 'Certified Vegan mark' },
]

/** Required items not found on the carton: X-ray draws them as dashed ghost boxes. */
export const SAMPLE_MISSING: PackRegion[] = [
  { panel: 'Front', x: 246, y: 262, w: 60, h: 14, label: 'Net quantity in oz' },
  { panel: 'Right', x: 166, y: 255, w: 60, h: 30, label: "Maker's address" },
]
