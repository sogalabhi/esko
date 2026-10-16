import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DANCING_FISH_PACK, SAMPLE_FINDINGS, SAMPLE_MISSING, SAMPLE_REGULATED } from './fixture'
import { PackView3D } from './PackView3D'

const gl = vi.hoisted(() => ({ available: false }))

// No WebGL in jsdom: the canvas is mocked out and these tests cover the DOM around it.
vi.mock('@react-three/fiber', () => ({ Canvas: () => <canvas data-testid="r3f" />, useThree: () => ({}), useFrame: () => {} }))
vi.mock('@react-three/drei', () => ({ CameraControls: () => null, Html: () => null }))
vi.mock('./webgl', () => ({ webglAvailable: () => gl.available }))
vi.mock('./artwork', () => ({ useArtwork: () => ({ texture: null, frame: { x: 0, y: 0, w: 457, h: 380 }, status: 'fallback' }) }))
vi.mock('../lib/motion', () => ({ prefersReducedMotion: () => true }))

const base = { geometry: DANCING_FISH_PACK, findings: SAMPLE_FINDINGS, regulated: SAMPLE_REGULATED, missing: SAMPLE_MISSING }

describe('PackView3D', () => {
  beforeEach(() => {
    gl.available = true
  })

  it('lists every finding once with an icon word, not colour alone', () => {
    render(<PackView3D {...base} />)
    const list = screen.getByRole('complementary', { name: 'Findings on the box' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(SAMPLE_FINDINGS.length)
    expect(within(items[0]).getByText('Check')).toBeInTheDocument()
    expect(within(list).getAllByText('Problem')).toHaveLength(3)
    expect(within(list).getByText('Pass')).toBeInTheDocument()
  })

  it('reports a selected finding', async () => {
    const onSelect = vi.fn()
    render(<PackView3D {...base} onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('button', { name: /Nutrition Facts: daily values wrong/ }))
    expect(onSelect).toHaveBeenCalledWith('c-nfp')
  })

  it('folds straight to the closed box when motion is reduced', async () => {
    render(<PackView3D {...base} />)
    expect(screen.getByRole('slider', { name: /Fold/ })).toHaveValue('0')
    await userEvent.click(screen.getByRole('button', { name: 'Fold box' }))
    expect(screen.getByRole('slider', { name: /Fold/ })).toHaveValue('100')
    expect(screen.getByRole('button', { name: 'Unfold' })).toBeInTheDocument()
  })

  it('X-ray toggle names the ghost boxes for missing items', async () => {
    render(<PackView3D {...base} />)
    const toggle = screen.getByRole('button', { name: /X-ray/ })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    const legend = screen.getByLabelText('X-ray legend')
    expect(within(legend).getByText(/Missing, ghost box/)).toBeInTheDocument()
    for (const m of SAMPLE_MISSING) expect(within(legend).getByText(new RegExp(m.label))).toBeInTheDocument()
  })

  it('keeps an unplaceable finding visible instead of dropping it', () => {
    render(<PackView3D {...base} findings={[...SAMPLE_FINDINGS, { id: 'x', panel: 'Lid', x: 999, y: 999, severity: 'low', label: 'Orphan' }]} />)
    expect(screen.getByText(/Not on a panel/)).toBeInTheDocument()
    expect(screen.getByText(/Orphan/)).toBeInTheDocument()
  })

  it('explains when WebGL is off and keeps the findings', () => {
    gl.available = false
    render(<PackView3D {...base} />)
    expect(screen.getByRole('alert')).toHaveTextContent('3D view unavailable')
    expect(screen.queryByTestId('r3f')).not.toBeInTheDocument()
    expect(within(screen.getByRole('complementary')).getAllByRole('listitem')).toHaveLength(SAMPLE_FINDINGS.length)
  })

  it('handles loading, error with retry, and an empty dieline', async () => {
    const { rerender } = render(<PackView3D geometry={null} loading />)
    expect(screen.getByRole('region', { name: '3D pack view' })).toHaveAttribute('aria-busy', 'true')

    const onRetry = vi.fn()
    rerender(<PackView3D geometry={null} error="the dieline has no Crease layer" onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toHaveTextContent('the dieline has no Crease layer')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()

    rerender(<PackView3D geometry={{ panels: [], folds: [] }} />)
    expect(screen.getByText(/No dieline panels yet/)).toBeInTheDocument()
  })
})
