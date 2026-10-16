import { Vector3 } from 'three'
import { DANCING_FISH_PACK, SAMPLE_FINDINGS } from './fixture'
import {
  CLOSED_ANGLE,
  buildHingeTree,
  faceNormal,
  faceToPage,
  hingeAngles,
  layoutAt,
  pageToFace,
  pageToUv,
  pageToWorld,
  panelsFrame,
  placePins,
  uvToPage,
  worldToPage,
} from './geometry'

const tree = buildHingeTree(DANCING_FISH_PACK)
const panel = (name: string) => DANCING_FISH_PACK.panels.find((p) => p.name === name)!

describe('hinge tree', () => {
  it('connects every panel of the sample dieline to the Front', () => {
    expect(tree.root).toBe('Front')
    expect(tree.loose).toEqual([])
    expect(new Set(tree.order)).toEqual(new Set(DANCING_FISH_PACK.panels.map((p) => p.name)))
  })

  it('stages sides first, then dust flaps, then the lid and bottom tuck', () => {
    expect(tree.hinges.get('Right')!.kind).toBe('side')
    expect(tree.hinges.get('Glue flap')!.kind).toBe('side')
    expect(tree.hinges.get('Top dust · Left')!.kind).toBe('dust')
    expect(tree.hinges.get('Top flap · Back')!.kind).toBe('lid')
    expect(tree.hinges.get('Bottom flap · Front')!.kind).toBe('lid')
  })
})

describe('hinge angles', () => {
  it('are all 0° flat and all 90° folded', () => {
    const flat = hingeAngles(tree, 0)
    const closed = hingeAngles(tree, 1)
    expect(Object.keys(flat)).toHaveLength(DANCING_FISH_PACK.panels.length - 1)
    for (const a of Object.values(flat)) expect(a).toBe(0)
    for (const a of Object.values(closed)) expect(a).toBeCloseTo(CLOSED_ANGLE)
  })

  it('turns the sides before the lid half way through', () => {
    const mid = hingeAngles(tree, 0.5)
    expect(mid['Right']).toBeCloseTo(CLOSED_ANGLE)
    expect(mid['Top flap · Back']).toBe(0)
  })
})

describe('folded box', () => {
  const closed = layoutAt(tree, 1)
  const n = (name: string) => faceNormal(closed, name)

  it('points every outer face outward, one per side of the box', () => {
    const expected: [string, Vector3][] = [
      ['Front', new Vector3(0, 0, 1)],
      ['Back', new Vector3(0, 0, -1)],
      ['Right', new Vector3(-1, 0, 0)],
      ['Left', new Vector3(1, 0, 0)],
      ['Top flap · Back', new Vector3(0, 1, 0)],
      ['Bottom flap · Front', new Vector3(0, -1, 0)],
    ]
    for (const [name, v] of expected) expect(n(name).distanceTo(v)).toBeLessThan(1e-6)
  })

  it('closes: the Back edge meets the Left edge and the lid reaches the Front', () => {
    const backFar = pageToWorld(closed, 'Back', 15, 200)
    const leftFar = pageToWorld(closed, 'Left', 457, 200)
    expect(backFar.distanceTo(leftFar)).toBeLessThan(1)
    const lidTip = pageToWorld(closed, 'Top flap · Back', 80, 61)
    const frontTop = pageToWorld(closed, 'Front', 306, 141)
    expect(Math.abs(lidTip.z - frontTop.z)).toBeLessThan(1)
    expect(Math.abs(lidTip.y - frontTop.y)).toBeLessThan(1e-6)
  })

  it('is centred on the origin', () => {
    const c = pageToWorld(closed, 'Front', 306.5, 220.5)
    expect(Math.abs(c.x)).toBeLessThan(1e-6)
    expect(Math.abs(c.y)).toBeLessThan(1e-6)
  })
})

describe('mm ↔ face mapping', () => {
  const pts: [string, number, number][] = [
    ['Back', 60, 205],
    ['Front', 353, 276],
    ['Left', 417, 220],
    ['Top flap · Back', 85, 100],
    ['Bottom dust · Right', 190, 320],
  ]

  it('round-trips page mm through face coordinates', () => {
    for (const [name, x, y] of pts) {
      const { u, v } = pageToFace(panel(name), x, y)
      expect(u).toBeGreaterThanOrEqual(0)
      expect(u).toBeLessThanOrEqual(1)
      const back = faceToPage(panel(name), u, v)
      expect(back.x).toBeCloseTo(x)
      expect(back.y).toBeCloseTo(y)
    }
  })

  it('round-trips page mm through texture UVs', () => {
    const frame = panelsFrame(DANCING_FISH_PACK.panels)
    for (const [, x, y] of pts) {
      const [u, v] = pageToUv(frame, x, y)
      const back = uvToPage(frame, u, v)
      expect(back.x).toBeCloseTo(x)
      expect(back.y).toBeCloseTo(y)
    }
  })

  it.each([0, 0.3, 0.7, 1])('round-trips page mm through the 3D face at fold %s', (fold) => {
    const layout = layoutAt(tree, fold)
    for (const [name, x, y] of pts) {
      const world = pageToWorld(layout, name, x, y, 0.5)
      const back = worldToPage(layout, name, world)
      expect(back.x).toBeCloseTo(x)
      expect(back.y).toBeCloseTo(y)
      expect(back.lift).toBeCloseTo(0.5)
    }
  })
})

describe('pins', () => {
  it('gives every finding exactly one pin on its own face', () => {
    const { placed, unplaced } = placePins(SAMPLE_FINDINGS, DANCING_FISH_PACK.panels)
    expect(unplaced).toEqual([])
    expect(placed.map((p) => p.finding.id)).toEqual(SAMPLE_FINDINGS.map((f) => f.id))
    for (const p of placed) expect(p.panel).toBe(p.finding.panel)
  })

  it('falls back to the panel under the point, and never drops an unplaceable finding', () => {
    const { placed, unplaced } = placePins(
      [
        { id: 'a', panel: 'Side panel', x: 400, y: 200, severity: 'low', label: 'a' },
        { id: 'b', panel: 'Nowhere', x: 900, y: 900, severity: 'low', label: 'b' },
        { id: 'a', panel: 'Left', x: 400, y: 200, severity: 'low', label: 'dup' },
      ],
      DANCING_FISH_PACK.panels,
    )
    expect(placed).toEqual([{ finding: expect.objectContaining({ id: 'a' }), panel: 'Left' }])
    expect(unplaced.map((f) => f.id)).toEqual(['b'])
  })
})
