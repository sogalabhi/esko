import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockProject } from '../state/project'
import { renderWithProject } from '../test/render'
import { get, json, renderLive, stubFetch } from '../test/renderLive'
import type { Project } from '../types/project'
import { Markup } from './Markup'
import { guideLayers } from './markup/useCartonImage'

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({ promise: Promise.reject(Object.assign(new Error('Missing PDF'), { status: 404 })), destroy: () => {} }),
}))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.js' }))

const project = (): Project => structuredClone(mockProject)
const onCarton = (p: Project) => p.conflicts.filter((c) => c.locations.some((l) => l.fileId === 'f-carton'))

const markButtons = () => [...document.querySelectorAll('[data-mark] > [role="button"], [data-cluster] > [role="button"]')]
const canvas = () => screen.getByRole('group', { name: /Carton markup/ })
const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** The single-spot findings printed in the mock carton's nutrition table. */
const NUTRITION = ['c-carbs', 'c-dv-fat', 'c-dv-vitd', 'c-dv-calcium', 'c-calories', 'c-serving', 'c-sodium']
const clusterButton = () => within(canvas()).getByRole('button', { name: /^Nutrition: 7 problems/ })

beforeEach(() => {
  // Each test starts with the poster class off.
  document.body.classList.remove('bf-printing')
})
afterEach(() => vi.unstubAllGlobals())

describe('Markup: red pen', () => {
  it('marks every open finding at each of its carton spots, named by the finding text; the nutrition table is one box', () => {
    const p = project()
    renderWithProject(<Markup />, '/markup', p)
    const singles = onCarton(p).filter((c) => !NUTRITION.includes(c.id))
    const spots = singles.flatMap((c) => c.locations.filter((l) => l.fileId === 'f-carton'))
    expect(document.querySelectorAll('[data-mark] > [role="button"]')).toHaveLength(spots.length)
    for (const c of singles) {
      const n = c.locations.filter((l) => l.fileId === 'f-carton').length
      const name = n > 1 ? `${c.explanation} (spot 1 of ${n})` : c.explanation
      expect(within(canvas()).getByRole('button', { name })).toBeInTheDocument()
    }
    // The table's findings have no mark of their own: one box with the count stands for them.
    for (const id of NUTRITION) expect(document.querySelector(`[data-mark="${id}"]`)).toBeNull()
    expect(clusterButton()).toHaveAttribute('aria-expanded', 'false')
    expect(canvas().querySelectorAll('[data-cluster]')).toHaveLength(1)
    expect(canvas().getAttribute('aria-label')).toMatch(/7 of them in 1 box/)
  })

  it('draws the nutrition findings as one box, one number, one margin note and one arrow, not one each', () => {
    renderWithProject(<Markup />, '/markup', project())
    const svg = canvas()
    const notes = [...svg.querySelectorAll('[data-note]')]
    const clusterNotes = notes.filter((n) => n.getAttribute('data-note-kind') === 'cluster')
    expect(clusterNotes).toHaveLength(1)
    expect(clusterNotes[0]).toHaveTextContent('7 problems in Nutrition')
    for (const id of NUTRITION) expect(svg.querySelector(`[data-note="${id}"]`)).toBeNull()
    // One note per single plus one for the box; one arrow per note.
    const singles = new Set([...svg.querySelectorAll('[data-mark]')].map((e) => e.getAttribute('data-mark')))
    expect(notes).toHaveLength(singles.size + 1)
    expect(svg.querySelectorAll('[data-layer="marks"] > g[aria-hidden="true"]:not([data-note])')).toHaveLength(notes.length)
  })

  it('keeps the corrections inside a collapsed box: strike on the printed value, computed value written by it', () => {
    renderWithProject(<Markup />, '/markup', project())
    const fat = canvas().querySelector('[data-cluster] [data-member="c-dv-fat"]') as HTMLElement
    expect(within(fat).getByText('≈19%')).toBeInTheDocument()
    expect(fat.querySelectorAll('path.pen-stroke')).toHaveLength(2) // the double strike
  })

  it('opening the box lists every finding in it beside the carton; picking one rings its spot and opens the drawer', async () => {
    const user = userEvent.setup()
    const p = project()
    renderWithProject(<Markup />, '/markup', p)
    await user.click(clusterButton())
    expect(clusterButton()).toHaveAttribute('aria-expanded', 'true')
    const panel = screen.getByRole('region', { name: /Nutrition: 7 problems/ })
    const items = within(within(panel).getByRole('list', { name: 'Findings in Nutrition' })).getAllByRole('button')
    expect(items).toHaveLength(NUTRITION.length)
    for (const id of NUTRITION) expect(within(panel).getByRole('button', { name: new RegExp(esc(p.conflicts.find((c) => c.id === id)!.explanation)) })).toBeInTheDocument()
    // Still one note for the box: the list is in the panel, not in the margin.
    expect(canvas().querySelectorAll('[data-note-kind="cluster"]')).toHaveLength(1)
    for (const id of NUTRITION) expect(canvas().querySelector(`[data-note="${id}"]`)).toBeNull()

    const fat = p.conflicts.find((c) => c.id === 'c-dv-fat')!
    await user.click(within(panel).getByRole('button', { name: new RegExp(esc(fat.explanation)) }))
    expect(canvas().querySelector('[data-focus="c-dv-fat"]')).not.toBeNull()
    expect(within(panel).getByRole('button', { name: new RegExp(esc(fat.explanation)) })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('dialog', { name: 'Source' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^Finding \d+ · Legal/ })).toBeInTheDocument()

    // Close the list from the panel.
    await user.click(within(panel).getByRole('button', { name: 'Close list' }))
    expect(screen.queryByRole('region', { name: /Nutrition: 7 problems/ })).toBeNull()
  })

  it('the box note opens the list too', async () => {
    const user = userEvent.setup()
    renderWithProject(<Markup />, '/markup', project())
    await user.click(canvas().querySelector('[data-note-kind="cluster"]')!)
    expect(screen.getByRole('region', { name: /Nutrition: 7 problems/ })).toBeInTheDocument()
  })

  it('the honey mark stays its own mark; the drawer opens the carton source and the card the sheet source', async () => {
    const user = userEvent.setup()
    const p = project()
    renderWithProject(<Markup />, '/markup', p)
    const honey = p.conflicts.find((c) => c.id === 'c-honey')!
    expect(document.querySelector('[data-cluster] [data-member="c-honey"]')).toBeNull()
    expect(document.querySelector('[data-note="c-honey"]')).toHaveTextContent('sheet says 9%')
    await user.click(within(canvas()).getByRole('button', { name: honey.explanation }))
    const drawer = screen.getByRole('dialog', { name: 'Source' })
    expect(drawer).toHaveTextContent('Honey (1%)')
    await user.click(within(drawer).getByRole('button', { name: 'Close source' }))
    const card = screen.getByRole('heading', { name: /Finding 1 · R&D/ }).parentElement!
    const sheetChip = within(card).getAllByRole('button').find((b) => /^Sheet/.test(b.getAttribute('aria-label') ?? b.textContent ?? ''))!
    await user.click(sheetChip)
    expect(screen.getByRole('dialog', { name: 'Source' })).toHaveTextContent(/Sheet|Content sheet/)
    expect(screen.getByRole('dialog', { name: 'Source' })).not.toHaveTextContent('Honey (1%)')
  })

  it('draws each mark at its location, in the page mm frame', () => {
    const p = project()
    renderWithProject(<Markup />, '/markup', p)
    const svg = canvas() as unknown as SVGSVGElement
    const [, , vw] = svg.getAttribute('viewBox')!.split(' ').map(Number)
    expect(vw).toBeGreaterThan(456) // the page plus the note margins
    const honey = p.conflicts.find((c) => c.id === 'c-honey')!.locations[0]
    const hit = document.querySelector('[data-mark="c-honey"] [role="button"] rect')!
    const x = Number(hit.getAttribute('x'))
    const w = Number(hit.getAttribute('width'))
    const y = Number(hit.getAttribute('y'))
    const h = Number(hit.getAttribute('height'))
    expect(x + w / 2).toBeCloseTo(honey.x + honey.w / 2, 5)
    expect(y + h / 2).toBeCloseTo(honey.y + honey.h / 2, 5)
    expect(x).toBeLessThan(honey.x)
    expect(x + w).toBeGreaterThan(honey.x + honey.w)
  })

  it('writes the computed value above a wrong printed one, and a sheet note for a value conflict', () => {
    renderWithProject(<Markup />, '/markup', project())
    expect(within(canvas().querySelector('[data-member="c-dv-fat"]') as HTMLElement).getByText('≈19%')).toBeInTheDocument()
    expect(document.querySelector('[data-note="c-honey"]')).toHaveTextContent('sheet says 9%')
  })

  it('does not mark resolved findings', () => {
    const p = project()
    p.conflicts.find((c) => c.id === 'c-honey')!.resolution = { choice: 'left', by: 'Abhijith', at: '2026-10-16T10:00:00Z' }
    renderWithProject(<Markup />, '/markup', p)
    expect(document.querySelector('[data-mark="c-honey"]')).toBeNull()
    expect(within(canvas()).queryByRole('button', { name: p.conflicts.find((c) => c.id === 'c-honey')!.explanation })).toBeNull()
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('1 resolved')
  })

  it('a mark opens the Source Drawer at its spot and the finding card; deciding it removes the mark live', async () => {
    const user = userEvent.setup()
    const p = project()
    renderWithProject(<Markup />, '/markup', p)
    const honey = p.conflicts.find((c) => c.id === 'c-honey')!
    await user.click(within(canvas()).getByRole('button', { name: honey.explanation }))
    const drawer = screen.getByRole('dialog', { name: 'Source' })
    expect(drawer).toHaveTextContent('Honey (1%)')
    expect(drawer).toHaveTextContent('Carton · Back panel')
    await user.click(within(drawer).getByRole('button', { name: 'Close source' }))
    const card = screen.getByRole('heading', { name: /Finding 1 · R&D/ }).parentElement!
    await user.click(within(card).getByRole('button', { name: 'Use left' }))
    expect(document.querySelector('[data-mark="c-honey"]')).toBeNull()
    expect(within(card).getByText(/Resolved by Abhijith/)).toBeInTheDocument()
  })

  it('opens a mark from the keyboard, and J / K move between marks', async () => {
    const user = userEvent.setup()
    renderWithProject(<Markup />, '/markup', project())
    await user.keyboard('j')
    const first = document.activeElement!
    expect(first.closest('[data-mark]')?.getAttribute('data-n')).toBe('1')
    await user.keyboard('j')
    expect(document.activeElement!.closest('[data-mark]')?.getAttribute('data-n')).toBe('2')
    await user.keyboard('k')
    expect(document.activeElement).toBe(first)
    await user.keyboard('{Enter}')
    expect(screen.getByRole('dialog', { name: 'Source' })).toBeInTheDocument()
  })

  it('ticks the barcode pass and names it', () => {
    renderWithProject(<Markup />, '/markup', project())
    expect(within(canvas()).getByRole('button', { name: /^Check passed: UPC/ })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('1 check passed')
  })

  it('every mark has a name and visible text beside the drawing', () => {
    renderWithProject(<Markup />, '/markup', project())
    for (const b of markButtons()) {
      expect(b.getAttribute('aria-label')?.length).toBeGreaterThan(10)
      expect(b.textContent).toMatch(/\d/) // the finding number written next to it
    }
  })
})

describe('Markup: toggles', () => {
  it('Clean hides the markup and Marked brings it back (aria-pressed)', async () => {
    const user = userEvent.setup()
    renderWithProject(<Markup />, '/markup', project())
    const clean = screen.getByRole('button', { name: 'Clean' })
    const marked = screen.getByRole('button', { name: 'Marked' })
    expect(marked).toHaveAttribute('aria-pressed', 'true')
    expect(clean).toHaveAttribute('aria-pressed', 'false')
    await user.click(clean)
    expect(clean).toHaveAttribute('aria-pressed', 'true')
    expect(marked).toHaveAttribute('aria-pressed', 'false')
    expect(markButtons()).toHaveLength(0)
    await user.click(marked)
    expect(markButtons().length).toBeGreaterThan(0)
  })

  it('sticky notes by owner: notes show the owner word and stay connected to their mark', async () => {
    const user = userEvent.setup()
    const p = project()
    renderWithProject(<Markup />, '/markup', p)
    const toggle = screen.getByRole('button', { name: 'Sticky notes by owner' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(document.querySelector('[data-note][data-owner]')).toBeNull()
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    const honey = document.querySelector('[data-note="c-honey"]')!
    expect(honey.getAttribute('data-owner')).toBe('rnd')
    expect(honey).toHaveTextContent('R&D · #1')
    expect(document.querySelector('[data-note="c-added-sugar"]')).toHaveTextContent(/^LEGAL/)
    // One sticky per single finding and one for the nutrition box, in its main owner's colour.
    expect(canvas().querySelectorAll('[data-note]')).toHaveLength(onCarton(p).length - NUTRITION.length + 1)
    const box = canvas().querySelector('[data-note-kind="cluster"]')!
    expect(box.getAttribute('data-owner')).toBe('legal')
    expect(box).toHaveTextContent(/^LEGAL · #\d+7 problems in Nutrition/)
  })

  it('track changes shows insertions, deletions and duplicates from carton to sheet', async () => {
    const user = userEvent.setup()
    renderWithProject(<Markup />, '/markup', project())
    const toggle = screen.getByRole('button', { name: 'Track changes' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('region', { name: /Track changes/ })).toBeNull()
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    const panel = screen.getByRole('region', { name: /Track changes · Carton → Sheet/ })
    const list = within(panel).getByRole('article', { name: 'Ingredient list' })
    expect(list.querySelector('del[data-kind="del"]')).toHaveTextContent('Walnuts')
    expect(list.querySelector('mark[data-kind="dup"]')).toHaveTextContent('Sunflower Seeds')
    expect(list.querySelector('[data-kind="change"]')).toBeInTheDocument()
    expect(within(panel).getByRole('article', { name: 'Allergen statement' })).toBeInTheDocument()
    const ins = [...within(panel).getByRole('article', { name: 'Claims and marks' }).querySelectorAll('ins')].map((e) => e.textContent)
    expect(ins.some((x) => /tail fins/.test(x ?? ''))).toBe(true)
  })
})

describe('Markup: answering questions', () => {
  it('a finding settled by an answered question is not marked (mock mode)', () => {
    const p = project()
    p.questions.find((q) => q.id === 'q-honey')!.status = 'answered'
    renderWithProject(<Markup />, '/markup', p)
    expect(document.querySelector('[data-mark="c-honey"]')).toBeNull()
    expect(document.querySelector('[data-mark="c-ingredients"]')).not.toBeNull()
  })
})

describe('Markup: A3 poster', () => {
  it('prints only the poster: one A3 landscape page, app controls hidden', () => {
    renderWithProject(<Markup />, '/markup', project())
    const posterCss = screen.getByTestId('poster').querySelector('style')!.textContent!
    expect(posterCss).toMatch(/@page poster\s*{[^}]*size:\s*A3 landscape/)
    expect(posterCss).toMatch(/body\.bf-printing > \*:not\(\.bf-poster\)\s*{\s*display:\s*none !important/)
    expect(posterCss).toMatch(/\.bf-poster\s*{\s*display:\s*none/)
  })

  it('Export A3 poster prints with the poster class on <body>, then removes it', async () => {
    const user = userEvent.setup()
    let during = false
    const print = vi.fn(() => {
      during = document.body.classList.contains('bf-printing')
    })
    vi.stubGlobal('print', print)
    renderWithProject(<Markup />, '/markup', project())
    await user.click(screen.getByRole('button', { name: 'Export A3 poster' }))
    expect(print).toHaveBeenCalledTimes(1)
    expect(during).toBe(true)
    await act(async () => {
      window.dispatchEvent(new Event('afterprint'))
    })
    await waitFor(() => expect(document.body.classList.contains('bf-printing')).toBe(false))
  })

  it('the poster has the marked carton, a legend and the decisions, and no controls', () => {
    const p = project()
    p.conflicts.find((c) => c.id === 'c-sodium')!.resolution = { choice: 'left', by: 'Abhijith', at: '2026-10-16T10:00:00Z' }
    renderWithProject(<Markup />, '/markup', p)
    const poster = screen.getByTestId('poster')
    expect(poster.parentElement).toBe(document.body)
    expect(poster).toHaveClass('bf-poster')
    expect(poster).toHaveAttribute('aria-hidden', 'true')
    expect(poster.querySelectorAll('button, [role="button"], input')).toHaveLength(0)
    const drawn = new Set([...poster.querySelectorAll('[data-mark], svg [data-member]')].map((e) => e.getAttribute('data-mark') ?? e.getAttribute('data-member')))
    expect(drawn.size).toBe(onCarton(p).length - 1)
    // Same collapsed view as on screen, plus a footnote table of what each box holds.
    expect(poster.querySelectorAll('[data-cluster]')).toHaveLength(1)
    const table = within(poster).getByTestId('poster-clusters')
    expect(table).toHaveTextContent('6 problems in Nutrition')
    expect(table.querySelectorAll('tr[data-member]')).toHaveLength(6)
    expect(table).toHaveTextContent('≈19%')
    expect(poster).toHaveTextContent('Legend')
    expect(poster).toHaveTextContent(/Decisions \(1\)/)
    expect(poster).toHaveTextContent(/Sodium differs .* use sheet value · Abhijith/)
  })
})

describe('Markup: states', () => {
  it('shows an empty state when there is no carton PDF', () => {
    const p = project()
    p.files = p.files.filter((f) => f.type !== 'pdf')
    p.conflicts = []
    renderWithProject(<Markup />, '/markup', p)
    expect(screen.getByRole('heading', { name: 'No current pack' })).toBeInTheDocument()
    expect(screen.getByText(/The brief works without it/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Upload the old pack' })).toHaveAttribute('href', '/evidence')
    expect(screen.queryByRole('group', { name: /Carton markup/ })).toBeNull()
    expect(document.querySelectorAll('[data-mark], [data-cluster]')).toHaveLength(0)
  })

  it('lists open findings that have no spot on the carton', () => {
    const p = project()
    p.conflicts.find((c) => c.id === 'c-address')!.locations = []
    renderWithProject(<Markup />, '/markup', p)
    const sec = screen.getByRole('region', { name: 'Open findings with no spot on the carton' })
    expect(within(sec).getByRole('button', { name: /no place of business/ })).toBeInTheDocument()
  })

  it('says why the carton PDF could not be drawn, keeps the marks on the outlines, and retries', async () => {
    stubFetch(get('/api/project', () => json(project())))
    renderLive(<Markup />, { gate: true, route: '/markup' })
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('The carton PDF could not be drawn: the backend does not have this file any more')
    expect(markButtons().length).toBeGreaterThan(0)
    await userEvent.setup().click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})

describe('guideLayers', () => {
  it('reads the guide layers the backend skipped, so the render can switch them off', () => {
    expect(guideLayers([{ item: "Ignored 33 guide pieces (guide layer 'Dimensions and text')", reason: "'Orientation' ×11" }])).toEqual(['Dimensions and text'])
    expect(guideLayers([{ item: 'Hidden EU table', reason: 'Covered by the US panel' }])).toEqual([])
  })
})
