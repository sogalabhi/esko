import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockProject } from '../state/project'
import { renderWithProject } from '../test/render'
import { SourceChip, SourceChips } from './SourceChip'

const honey = mockProject.conflicts.find((c) => c.id === 'c-honey')!
const sheetSrc = honey.left.sources[0]
const cartonSrc = honey.right.sources[0]

describe('SourceChip', () => {
  it('labels carton and sheet sources by short location', () => {
    renderWithProject(<SourceChips sources={[cartonSrc, sheetSrc]} />)
    expect(screen.getByRole('button', { name: 'Carton · Back' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sheet · B26' })).toBeInTheDocument()
  })

  it('opens the source drawer with location, quote and check line (sheet)', async () => {
    renderWithProject(<SourceChip source={sheetSrc} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Sheet · B26' }))
    const drawer = screen.getByRole('dialog', { name: 'Source' })
    expect(within(drawer).getByRole('heading', { name: 'Content sheet · B26' })).toBeInTheDocument()
    expect(within(drawer).getByText('"Honey (9%)"')).toBeInTheDocument()
    expect(within(drawer).getByText(/Quote checked by code/)).toBeInTheDocument()
    expect(drawer.querySelector('td[data-target]')).toHaveTextContent('Honey (9%)')
    await userEvent.click(within(drawer).getByRole('button', { name: 'Close source' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the carton panel frame with a highlight box', async () => {
    renderWithProject(<SourceChip source={cartonSrc} />)
    await userEvent.click(screen.getByRole('button', { name: 'Carton · Back' }))
    const drawer = screen.getByRole('dialog')
    expect(within(drawer).getByRole('heading', { name: 'Carton · Back panel' })).toBeInTheDocument()
    expect(drawer.querySelector('rect[data-highlight]')).not.toBeNull()
  })

  it('says when a quote was not found', async () => {
    renderWithProject(<SourceChip source={{ ...cartonSrc, quoteChecked: false }} />)
    await userEvent.click(screen.getByRole('button', { name: /Carton · Back/ }))
    expect(screen.getByText('Quote not found — demoted to AI-suggested')).toBeInTheDocument()
  })
})
