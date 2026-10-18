import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { Quaternion, Vector3, type Object3D } from 'three'
import { CartonModel, cardPlacement, ClusterLabel } from './CartonModel'
import { DANCING_FISH_PACK, SAMPLE_FINDINGS, SAMPLE_MISSING, SAMPLE_REGULATED } from './fixture'
import { pinGroups } from './geometry'
import type { PackFinding } from './types'

/** The sample plus three more rows inside the Nutrition Facts table (Left panel). */
const CROWDED: PackFinding[] = [
  ...SAMPLE_FINDINGS,
  { id: 'n1', panel: 'Left', x: 430, y: 200, severity: 'medium', label: 'Fat % Daily Value' },
  { id: 'n2', panel: 'Left', x: 430, y: 244, severity: 'low', label: 'Vitamin D % Daily Value' },
  { id: 'n3', panel: 'Left', x: 425, y: 190, severity: 'medium', label: 'Calories do not add up' },
]

// Html renders DOM next to the WebGL canvas; the test renderer has no DOM, so drop it.
vi.mock('@react-three/drei', () => ({ Html: () => null }))

type Renderer = Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>

const named = (r: Renderer, prefix: string): Object3D[] => {
  const out: Object3D[] = []
  r.scene.instance.traverse((o) => {
    if (o.name.startsWith(prefix)) out.push(o)
  })
  return out
}

/** The face group an object sits in. */
const faceOf = (o: Object3D): string | undefined => {
  let p: Object3D | null = o.parent
  while (p && !p.name.startsWith('face:')) p = p.parent
  return p?.name.slice('face:'.length)
}

describe('CartonModel', () => {
  it('draws one face per dieline panel', async () => {
    const r = await ReactThreeTestRenderer.create(<CartonModel geometry={DANCING_FISH_PACK} fold={0} />)
    expect(named(r, 'face:').map((o) => o.name.slice(5)).sort()).toEqual(DANCING_FISH_PACK.panels.map((p) => p.name).sort())
    await r.unmount()
  })

  it('gives every problem exactly one pin, on the face it names; passed checks only when asked', async () => {
    const problems = SAMPLE_FINDINGS.filter((f) => f.severity !== 'pass')
    const r = await ReactThreeTestRenderer.create(<CartonModel geometry={DANCING_FISH_PACK} fold={1} findings={SAMPLE_FINDINGS} />)
    const pins = named(r, 'pin:')
    expect(pins).toHaveLength(problems.length)
    for (const f of problems) {
      const mine = pins.filter((p) => p.name === `pin:${f.id}`)
      expect(mine).toHaveLength(1)
      expect(faceOf(mine[0])).toBe(f.panel)
    }
    expect(pins.some((p) => p.userData.severity === 'pass')).toBe(false)
    await r.unmount()

    const all = await ReactThreeTestRenderer.create(<CartonModel geometry={DANCING_FISH_PACK} fold={1} findings={SAMPLE_FINDINGS} showPassed />)
    expect(named(all, 'pin:')).toHaveLength(SAMPLE_FINDINGS.length)
    expect(named(all, 'pin:c-barcode')).toHaveLength(1)
    await all.unmount()
  })

  it('folds findings crowding one region into one cluster pin with a count and the worst severity', async () => {
    const regions = SAMPLE_REGULATED
    const r = await ReactThreeTestRenderer.create(<CartonModel geometry={DANCING_FISH_PACK} fold={1} findings={CROWDED} clusterRegions={regions} />)
    const groups = pinGroups(CROWDED, DANCING_FISH_PACK.panels, regions)
    expect(groups.clusters).toHaveLength(1)
    const pins = named(r, 'pin:')
    // Clusters plus singles, and passed checks hidden.
    expect(pins).toHaveLength(groups.clusters.length + groups.singles.length)
    const cluster = pins.find((p) => p.userData.clusterId)!
    expect(cluster.userData).toMatchObject({ count: 4, severity: 'high', label: 'Nutrition Facts: 4 problems' })
    expect(faceOf(cluster)).toBe('Left')
    for (const id of ['n1', 'n2', 'n3', 'c-nfp']) expect(named(r, `pin:${id}`)).toHaveLength(0)
    expect(named(r, 'pin:c-honey')).toHaveLength(1)
    await r.unmount()
  })

  it('turns the hinges: flat at fold 0, 90° at fold 1', async () => {
    const angle = (r: Renderer, child: string, parent: string) => {
      const q = (name: string) => named(r, `face:${name}`)[0].quaternion as Quaternion
      return q(parent).angleTo(q(child))
    }
    const flat = await ReactThreeTestRenderer.create(<CartonModel geometry={DANCING_FISH_PACK} fold={0} />)
    expect(angle(flat, 'Right', 'Front')).toBeCloseTo(0)
    expect(angle(flat, 'Top flap · Back', 'Back')).toBeCloseTo(0)
    await flat.unmount()

    const closed = await ReactThreeTestRenderer.create(<CartonModel geometry={DANCING_FISH_PACK} fold={1} />)
    expect(angle(closed, 'Right', 'Front')).toBeCloseTo(Math.PI / 2)
    expect(angle(closed, 'Back', 'Right')).toBeCloseTo(Math.PI / 2)
    expect(angle(closed, 'Top flap · Back', 'Back')).toBeCloseTo(Math.PI / 2)
    expect(angle(closed, 'Bottom dust · Left', 'Left')).toBeCloseTo(Math.PI / 2)
    // The Back faces away from the Front once closed.
    const n = (name: string) => new Vector3(0, 0, 1).applyQuaternion(named(closed, `face:${name}`)[0].quaternion)
    expect(n('Back').dot(n('Front'))).toBeCloseTo(-1)
    await closed.unmount()
  })

  it('shows ghost boxes for missing items and regulated boxes only in X-ray', async () => {
    const props = { geometry: DANCING_FISH_PACK, fold: 1, regulated: SAMPLE_REGULATED, missing: SAMPLE_MISSING }
    const off = await ReactThreeTestRenderer.create(<CartonModel {...props} xray={false} />)
    expect(named(off, 'ghost:')).toHaveLength(0)
    expect(named(off, 'regulated:')).toHaveLength(0)
    await off.unmount()

    const on = await ReactThreeTestRenderer.create(<CartonModel {...props} xray />)
    const ghosts = named(on, 'ghost:')
    expect(ghosts.map((g) => g.name).sort()).toEqual(SAMPLE_MISSING.map((m) => `ghost:${m.label}`).sort())
    for (const m of SAMPLE_MISSING) expect(faceOf(ghosts.find((g) => g.name === `ghost:${m.label}`)!)).toBe(m.panel)
    expect(named(on, 'regulated:')).toHaveLength(SAMPLE_REGULATED.length)
    await on.unmount()
  })
})

describe('ClusterLabel', () => {
  const cluster = () => pinGroups(CROWDED, DANCING_FISH_PACK.panels, SAMPLE_REGULATED).clusters[0]

  it('is a button named with the count, showing the count and the worst-severity icon', () => {
    render(<ClusterLabel cluster={cluster()} expanded={false} selected={false} />)
    const badge = screen.getByRole('button', { name: 'Nutrition Facts: 4 problems' })
    expect(badge).toHaveAttribute('aria-expanded', 'false')
    expect(badge).toHaveTextContent('4')
    expect(badge.className).toMatch(/text-bad/)
    expect(screen.queryByRole('group')).toBeNull()
  })

  it('when open lists every member with its severity word; a member opens like a single pin', async () => {
    const onMember = vi.fn()
    render(<ClusterLabel cluster={cluster()} expanded selected selectedId="n1" onMember={onMember} />)
    const card = screen.getByRole('group', { name: /Nutrition Facts: 4 problems/ })
    const items = within(card).getAllByRole('button')
    expect(items).toHaveLength(4)
    expect(within(card).getByRole('button', { name: 'Check: Fat % Daily Value' })).toHaveAttribute('aria-current', 'true')
    expect(within(card).getByText('Problem')).toBeInTheDocument()
    await userEvent.click(within(card).getByRole('button', { name: /Calories do not add up/ }))
    expect(onMember).toHaveBeenCalledWith(expect.objectContaining({ id: 'n3' }))
  })
})

describe('cluster card placement', () => {
  const bounds = { top: 0, left: 0, bottom: 560, right: 800 }
  it('opens below and right by default, above near the bottom, left near the right edge', () => {
    expect(cardPlacement({ top: 100, bottom: 128, left: 100, right: 140 }, { width: 300, height: 280 }, bounds)).toEqual({ up: false, left: false })
    expect(cardPlacement({ top: 420, bottom: 448, left: 100, right: 140 }, { width: 300, height: 280 }, bounds)).toEqual({ up: true, left: false })
    expect(cardPlacement({ top: 100, bottom: 128, left: 700, right: 740 }, { width: 300, height: 280 }, bounds)).toEqual({ up: false, left: true })
  })

  it('a card opened near the bottom of the 3D view flips upward', () => {
    const rect = (r: { top: number; left: number; width: number; height: number }) => ({ ...r, bottom: r.top + r.height, right: r.left + r.width, x: r.left, y: r.top, toJSON: () => r }) as DOMRect
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.hasAttribute('data-label-bounds')) return rect({ top: 0, left: 0, width: 800, height: 560 })
      if (this.getAttribute('role') === 'group') return rect({ top: 500, left: 412, width: 300, height: 280 })
      return rect({ top: 470, left: 400, width: 40, height: 28 })
    })
    const c = pinGroups(CROWDED, DANCING_FISH_PACK.panels, SAMPLE_REGULATED).clusters[0]
    render(
      <div data-label-bounds>
        <ClusterLabel cluster={c} expanded selected={false} />
      </div>,
    )
    const card = screen.getByRole('group', { name: /Nutrition Facts: 4 problems/ })
    expect(card).toHaveAttribute('data-flip', 'up right')
    expect(card.className).toMatch(/bottom-4/)
    spy.mockRestore()
  })
})
