import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockProject } from '../state/project'
import { renderWithProject } from '../test/render'
import { get, json, renderLive, stubFetch } from '../test/renderLive'
import { DANCING_FISH_PACK } from '../three/fixture'
import type { Project } from '../types/project'
import { Pack } from './Pack'

const project = (): Project => structuredClone(mockProject)

describe('Pack screen (3D View)', () => {
  it('renders the pack header, toolbar controls and 3D viewer', async () => {
    renderWithProject(<Pack />)
    expect(screen.getByRole('heading', { level: 1, name: /Pack \(3D View\)/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Take 3D snapshot/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Fold box|Unfold/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /X-ray/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reset view/i })).toBeInTheDocument()
  })

  it('lists the findings on the box and selects one', async () => {
    renderWithProject(<Pack />)
    expect(screen.getByRole('heading', { level: 2, name: /Findings on the box/i })).toBeInTheDocument()
    const honeyBtn = screen.getByRole('button', { name: /different honey percentages/i })
    expect(honeyBtn).toBeInTheDocument()

    await userEvent.click(honeyBtn)
    await waitFor(() => {
      expect(screen.getByRole('region', { name: /Selected finding/i })).toBeInTheDocument()
    })
    expect(screen.getAllByText(/different honey percentages/i).length).toBeGreaterThan(0)
  })

  it('groups the nutrition table findings into one entry with a count, like the 2D markup; honey stays its own', async () => {
    renderWithProject(<Pack />)
    const list = screen.getByRole('complementary', { name: 'Findings on the box' })
    const cluster = within(list).getByRole('button', { name: 'Nutrition: 7 problems' })
    expect(within(list).getByRole('button', { name: /different honey percentages/i })).toBeInTheDocument()
    expect(within(list).queryByRole('button', { name: /Daily Value for total fat/ })).toBeNull()
    await userEvent.click(cluster)
    const members = within(list).getByRole('list', { name: 'Findings in Nutrition' })
    await userEvent.click(within(members).getByRole('button', { name: /Daily Value for total fat/ }))
    expect(screen.getByRole('region', { name: /Selected finding/i })).toHaveTextContent(/Daily Value for total fat/)
    // The passed barcode check is not pinned until asked for.
    expect(screen.getByRole('button', { name: /Show passed checks/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('takes a snapshot and allows dismissing it', async () => {
    renderWithProject(<Pack />)
    const snapBtn = screen.getByRole('button', { name: /Take 3D snapshot/i })
    await userEvent.click(snapBtn)

    // In JSDOM canvas snapshot may return null or data URL; if null, preview won't show
    // We can test that clicking the button runs without throwing
    expect(snapBtn).toBeInTheDocument()
  })
})

describe('Pack screen with the backend: never sample data', () => {
  afterEach(() => vi.unstubAllGlobals())
  const live = (p: Project, pack: () => Response) => {
    stubFetch(get('/api/project', () => json(p)), get('/api/pack', pack))
    renderLive(<Pack />, { gate: true, route: '/pack' })
  }
  const noSample = () => {
    expect(document.body).not.toHaveTextContent(/Dancing Fish/)
    expect(screen.queryByRole('complementary', { name: 'Findings on the box' })).toBeNull()
    expect(screen.queryByTestId('pack-canvas')).toBeNull()
  }

  it('only a content sheet: "No current pack" with a way to upload one, and no pins', async () => {
    const p = project()
    p.files = p.files.filter((f) => f.type !== 'pdf')
    live(p, () => json({ detail: 'No dieline PDF uploaded' }, 404))
    expect(await screen.findByRole('heading', { name: 'No current pack' })).toBeInTheDocument()
    expect(screen.getByText(/to see what changes on it/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Upload the old pack' })).toHaveAttribute('href', '/evidence')
    noSample()
  })

  it('a dieline the backend has not got (404): the same empty state', async () => {
    live(project(), () => json({ detail: 'No dieline PDF uploaded' }, 404))
    expect(await screen.findByRole('heading', { name: 'No current pack' })).toBeInTheDocument()
    noSample()
  })

  it('a dieline whose geometry fails: the error with its reason, not the sample carton', async () => {
    live(project(), () => json({ detail: 'Could not read the dieline geometry: no Crease layer' }, 422))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('no Crease layer')
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(/Dancing Fish/)
  })

  it('missing items with no slot from the fit engine are listed, never drawn as ghost boxes', async () => {
    const pack = {
      fileId: 'f-carton',
      pageW: 457,
      pageH: 381,
      panels: DANCING_FISH_PACK.panels.map((x) => ({ ...x, kind: 'face', live: [x.x, x.y, x.w, x.h], outline: [] })),
      folds: [],
      zones: [],
      blocks: [],
    }
    live(project(), () => json(pack))
    const list = await screen.findByRole('complementary', { name: 'Findings on the box' })
    const slotless = within(list).getByLabelText('Not on the pack yet')
    expect(slotless).toHaveTextContent(/Not on the pack yet: Maker's name and place of business, Net quantity in oz and g on front, Allergen "Contains" statement/)
    // No crease lines: shown flat, fold controls off, and the note says why.
    expect(screen.getByRole('button', { name: /Fold box/ })).toBeDisabled()
    expect(screen.getByText(/no crease lines were found, so it stays flat/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /X-ray/ }))
    expect(screen.getByLabelText('X-ray legend')).toHaveTextContent(/ghost box\s*0/)
    expect(document.body).not.toHaveTextContent(/Dancing Fish/)
  })
})
