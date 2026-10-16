import ReactThreeTestRenderer from '@react-three/test-renderer'
import { Quaternion, Vector3, type Object3D } from 'three'
import { CartonModel } from './CartonModel'
import { DANCING_FISH_PACK, SAMPLE_FINDINGS, SAMPLE_MISSING, SAMPLE_REGULATED } from './fixture'

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

  it('gives every finding exactly one pin, on the face it names', async () => {
    const r = await ReactThreeTestRenderer.create(<CartonModel geometry={DANCING_FISH_PACK} fold={1} findings={SAMPLE_FINDINGS} />)
    const pins = named(r, 'pin:')
    expect(pins).toHaveLength(SAMPLE_FINDINGS.length)
    for (const f of SAMPLE_FINDINGS) {
      const mine = pins.filter((p) => p.name === `pin:${f.id}`)
      expect(mine).toHaveLength(1)
      expect(faceOf(mine[0])).toBe(f.panel)
    }
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
