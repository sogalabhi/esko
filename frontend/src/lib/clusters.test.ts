import { describe, expect, it } from 'vitest'
import { mockProject } from '../state/project'
import { clusterFindings, clusterName, clusterNote, regionsFromFacts, worstSeverity, type ClusterItem, type ClusterRegion } from './clusters'

const item = (id: string, panel: string, x: number, y: number, severity: ClusterItem['severity'] = 'medium', extra: Partial<ClusterItem> = {}): ClusterItem => ({
  id,
  panel,
  x,
  y,
  w: 4,
  h: 2,
  severity,
  ...extra,
})

const table: ClusterRegion = { panel: 'Left', x: 380, y: 150, w: 70, h: 120, label: 'Table' }

describe('clusterFindings', () => {
  it('groups three or more items whose centres lie in one region, labelled by the region', () => {
    const items = [item('a', 'Left', 390, 160), item('b', 'Left', 420, 200, 'high'), item('c', 'Left', 400, 260, 'low'), item('d', 'Back', 40, 200)]
    const { clusters, singles } = clusterFindings(items, [table])
    expect(clusters).toHaveLength(1)
    expect(clusters[0]).toMatchObject({ kind: 'region', label: 'Table', panel: 'Left', members: ['a', 'b', 'c'], worst: 'high' })
    // The box holds the region and every member.
    const b = clusters[0].bbox
    expect(b.x).toBeLessThanOrEqual(380)
    expect(b.x + b.w).toBeGreaterThanOrEqual(450)
    expect(singles).toEqual(['d'])
  })

  it('uses the most specific region when regions are nested', () => {
    const inner: ClusterRegion = { panel: 'Left', x: 385, y: 155, w: 40, h: 40, label: 'Inner' }
    const items = [item('a', 'Left', 390, 160), item('b', 'Left', 400, 170), item('c', 'Left', 410, 180)]
    expect(clusterFindings(items, [table, inner]).clusters[0].label).toBe('Inner')
  })

  it('outside any region, chains items on one panel whose centres are within 25 mm', () => {
    // a–b 20 mm, b–c 20 mm (a–c 40 mm): one chain. d is 60 mm away.
    const items = [item('a', 'Back', 20, 20), item('b', 'Back', 40, 20), item('c', 'Back', 60, 20), item('d', 'Back', 120, 20)]
    const { clusters, singles } = clusterFindings(items, [])
    expect(clusters).toHaveLength(1)
    expect(clusters[0]).toMatchObject({ kind: 'near', label: '3 findings · Back', members: ['a', 'b', 'c'] })
    expect(singles).toEqual(['d'])
  })

  it('keeps fewer than three as singles, in a region or close together', () => {
    const inRegion = [item('a', 'Left', 390, 160), item('b', 'Left', 420, 200)]
    expect(clusterFindings(inRegion, [table])).toEqual({ clusters: [], singles: ['a', 'b'] })
    const near = [item('x', 'Back', 20, 20), item('y', 'Back', 30, 20)]
    expect(clusterFindings(near, [])).toEqual({ clusters: [], singles: ['x', 'y'] })
  })

  it('never merges items on different panels', () => {
    const items = [item('a', 'Back', 20, 20), item('b', 'Right', 30, 20), item('c', 'Back', 40, 20), item('d', 'Right', 35, 22)]
    expect(clusterFindings(items, []).clusters).toHaveLength(0)
    // Even under one region.
    const wide: ClusterRegion = { panel: 'Back', x: 0, y: 0, w: 100, h: 100, label: 'Wide' }
    expect(clusterFindings(items, [wide]).clusters).toHaveLength(0)
  })

  it('leaves solo items out of every group', () => {
    const items = [item('a', 'Left', 390, 160), item('b', 'Left', 420, 200), item('c', 'Left', 400, 260, 'high', { solo: true })]
    expect(clusterFindings(items, [table])).toEqual({ clusters: [], singles: ['a', 'b', 'c'] })
  })

  it('gives deterministic ids from the place and the sorted members, and a key from the place only', () => {
    const items = [item('a', 'Left', 390, 160), item('b', 'Left', 420, 200), item('c', 'Left', 400, 260), item('e', 'Left', 410, 240)]
    const one = clusterFindings(items, [table]).clusters[0]
    const shuffled = clusterFindings([items[2], items[0], items[3], items[1]], [table]).clusters[0]
    expect(shuffled.id).toBe(one.id)
    expect(one.id).toMatch(/^cluster-table-/)
    const fewer = clusterFindings(items.slice(0, 3), [table]).clusters[0]
    expect(fewer.id).not.toBe(one.id)
    expect(fewer.key).toBe(one.key)
  })

  it('takes the worst severity: high over medium over low', () => {
    expect(worstSeverity(['low', 'medium', 'low'])).toBe('medium')
    expect(worstSeverity(['low', 'high', 'medium'])).toBe('high')
    expect(worstSeverity(['low'])).toBe('low')
    const items = [item('a', 'Back', 20, 20, 'low'), item('b', 'Back', 30, 20, 'medium'), item('c', 'Back', 40, 20, 'low')]
    expect(clusterFindings(items, []).clusters[0].worst).toBe('medium')
  })

  it('names a cluster with its count', () => {
    const items = [item('a', 'Left', 390, 160), item('b', 'Left', 420, 200), item('c', 'Left', 400, 260)]
    const c = clusterFindings(items, [table]).clusters[0]
    expect(clusterName(c)).toBe('Table: 3 problems')
    expect(clusterNote(c)).toBe('3 problems in Table')
  })
})

describe('regionsFromFacts', () => {
  it('chains the rows one fact group prints on one panel into a block, labelled by the group', () => {
    const regions = regionsFromFacts(mockProject.facts, 'f-carton')
    const nutrition = regions.find((r) => r.label === 'Nutrition' && r.panel === 'Left')!
    // Every row of the table, from servings per container to potassium.
    expect(nutrition.x).toBeCloseTo(391.5)
    expect(nutrition.y).toBeCloseTo(177.5)
    expect(nutrition.y + nutrition.h).toBeCloseTo(260.4)
    // The ingredient list (with the honey % inside it) is its own block.
    expect(regions.find((r) => r.label === 'Ingredients' && r.panel === 'Back')).toMatchObject({ x: 46, y: 208, w: 41, h: 31 })
    // Nothing from the other file.
    expect(regionsFromFacts(mockProject.facts, 'f-sheet')).toEqual([])
  })
})
