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

const markButtons = () => [...document.querySelectorAll('[data-mark] > [role="button"]')]
const canvas = () => screen.getByRole('group', { name: /Carton markup/ })

beforeEach(() => {
  // Each test starts with the poster class off.
  document.body.classList.remove('bf-printing')
})
afterEach(() => vi.unstubAllGlobals())

describe('Markup: red pen', () => {
  it('marks every open finding at each of its carton spots, named by the finding text', () => {
    const p = project()
    renderWithProject(<Markup />, '/markup', p)
    const spots = onCarton(p).flatMap((c) => c.locations.filter((l) => l.fileId === 'f-carton'))
    expect(markButtons()).toHaveLength(spots.length)
    for (const c of onCarton(p)) {
      const n = c.locations.filter((l) => l.fileId === 'f-carton').length
      const name = n > 1 ? `${c.explanation} (spot 1 of ${n})` : c.explanation
      expect(within(canvas()).getByRole('button', { name })).toBeInTheDocument()
    }
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
    expect(within(document.querySelector('[data-mark="c-dv-fat"]') as HTMLElement).getByText('≈19%')).toBeInTheDocument()
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
    expect(canvas().querySelectorAll('[data-note]')).toHaveLength(onCarton(p).length)
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
    expect(new Set([...poster.querySelectorAll('[data-mark]')].map((e) => e.getAttribute('data-mark'))).size).toBe(onCarton(p).length - 1)
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
    expect(screen.getByRole('heading', { name: 'No carton PDF yet' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to Evidence' })).toHaveAttribute('href', '/evidence')
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
