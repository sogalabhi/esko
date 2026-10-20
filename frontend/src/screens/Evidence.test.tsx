import { act, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockProject } from '../state/project'
import { renderWithProject } from '../test/render'
import type { Project } from '../types/project'
import { Evidence } from './Evidence'

const card = (id: string) => document.querySelector<HTMLElement>(`[data-file="${id}"]`)!
const counter = () => screen.getByTestId('evidence-counter')

afterEach(() => vi.useRealTimers())

describe('Evidence screen', () => {
  it('shows both files with type, status, fact counts and the skipped list', () => {
    renderWithProject(<Evidence readMs={0} />)
    expect(screen.getByText('Drop your packaging files')).toBeInTheDocument()
    const carton = card('f-carton')
    expect(within(carton).getByRole('heading', { name: 'DancingFish_Granola_Berry_US_Carton.pdf' })).toBeInTheDocument()
    expect(within(carton).getByText(/Dieline PDF/)).toBeInTheDocument()
    expect(within(carton).getByTestId('file-status')).toHaveTextContent(/Read · \d+ facts found/)
    expect(within(carton).getByText(/Hidden EU 'Typical Values per 100g' table/)).toBeInTheDocument()
    expect(within(carton).getByText(/Guide text: 'Art orientation'/)).toBeInTheDocument()
    expect(within(carton).getByText(/Layers: Cut, Crease, Dimensions/)).toBeInTheDocument()
    expect(within(carton).getByRole('img', { name: /Carton thumbnail, \d+ facts located/ })).toBeInTheDocument()
    const sheet = card('f-sheet')
    expect(within(sheet).getByText(/Content spreadsheet/)).toBeInTheDocument()
    expect(within(sheet).getByText(/per-pack formulas/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Review facts' })).toHaveAttribute('href', '/facts')
  })

  it('counter line is derived from the store', () => {
    renderWithProject(<Evidence readMs={0} />)
    const p = mockProject
    const open = p.conflicts.filter((c) => !c.resolution).length
    const missing = p.facts.filter((f) => f.state === 'missing').length
    const pass = p.facts.filter((f) => f.state === 'pass').length
    expect(counter()).toHaveTextContent(`${p.facts.length} facts·${open} conflicts·${missing} missing·${pass} pass`)
  })

  it('simulates reading: facts appear over about 2 s with skeletons first', () => {
    vi.useFakeTimers()
    renderWithProject(<Evidence />)
    expect(counter()).toHaveTextContent(/^0 facts/)
    expect(within(card('f-carton')).getByTestId('file-status')).toHaveTextContent('Reading…')
    expect(screen.queryByText(/Hidden EU/)).toBeNull()
    act(() => vi.advanceTimersByTime(1000))
    const mid = Number(counter().textContent!.match(/(\d+) facts/)![1])
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(mockProject.facts.length)
    act(() => vi.advanceTimersByTime(1200))
    expect(counter()).toHaveTextContent(`${mockProject.facts.length} facts`)
    expect(screen.getByText(/Hidden EU/)).toBeInTheDocument()
  })

  it('partial: one file failed shows a reason, a retry and facts from the other file', () => {
    const p: Project = structuredClone(mockProject)
    p.files[1].status = 'error'
    renderWithProject(<Evidence readMs={0} />, '/', p)
    expect(screen.getByRole('alert')).toHaveTextContent(/2 of 3 files read/)
    const sheet = card('f-sheet')
    expect(within(sheet).getByTestId('file-status')).toHaveTextContent('Could not read')
    expect(within(sheet).getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(within(card('f-carton')).getByTestId('file-status')).toHaveTextContent(/Read · \d+ facts found/)
  })

  it('error: no file read, and empty: no files yet', () => {
    const p: Project = structuredClone(mockProject)
    p.files.forEach((f) => (f.status = 'error'))
    const { unmount } = renderWithProject(<Evidence readMs={0} />, '/', p)
    expect(screen.getByRole('alert')).toHaveTextContent('No file could be read')
    unmount()
    renderWithProject(<Evidence readMs={0} />, '/', { ...mockProject, files: [] })
    expect(screen.getByText('No files yet')).toBeInTheDocument()
  })
})
