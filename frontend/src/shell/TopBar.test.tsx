import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { mockProject } from '../state/project'
import { renderWithProject } from '../test/render'
import type { Project } from '../types/project'
import { TopBar } from './TopBar'

const project = (): Project => structuredClone(mockProject)

describe('TopBar', () => {
  it('shows the market as a label: no India option, no launch date or slider', () => {
    renderWithProject(<TopBar />)
    expect(screen.getByLabelText('Market: United States')).toHaveTextContent('United States')
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.queryByText('India')).toBeNull()
    expect(screen.queryByRole('slider')).toBeNull()
    expect(screen.queryByLabelText('Launch')).toBeNull()
  })

  it('shows the mode the backend chose, with its reason as the tooltip', () => {
    const p = project()
    p.mode = 'new_product'
    p.modeReason = 'Only a content sheet among the inputs'
    renderWithProject(<TopBar />, '/', p)
    const chip = screen.getByLabelText(/^Mode: New product/)
    expect(chip).toHaveTextContent('New product')
    expect(chip).toHaveAttribute('title', 'Only a content sheet among the inputs')
  })

  it('derives the mode when the backend does not say: a dieline means redesign, none means new product', () => {
    const p = project()
    delete p.mode
    delete p.modeReason
    const { unmount } = renderWithProject(<TopBar />, '/', p)
    expect(screen.getByLabelText(/^Mode: Redesign/)).toHaveAttribute('title', 'A pack file is among the inputs')
    unmount()

    const sheetOnly = project()
    delete sheetOnly.mode
    delete sheetOnly.modeReason
    sheetOnly.files = sheetOnly.files.filter((f) => f.type !== 'pdf')
    renderWithProject(<TopBar />, '/', sheetOnly)
    const chip = screen.getByLabelText(/^Mode: New product/)
    expect(chip).toHaveAttribute('title', 'No pack file among the inputs')
  })
})
