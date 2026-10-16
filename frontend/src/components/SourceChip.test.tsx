import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockProject } from '../state/project'
import { renderWithProject } from '../test/render'
import type { Project, ProjectFile, Source } from '../types/project'
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

describe('SourceChip for every file type', () => {
  const extra: ProjectFile[] = (['document', 'docx', 'text', 'image'] as const).map((type, i) => ({
    id: `f-${type}`,
    name: `file.${type}`,
    type,
    pages: i + 1,
    status: 'done',
    skipped: [],
  }))
  const project: Project = { ...structuredClone(mockProject), files: [...mockProject.files, ...extra] }
  const make = (fileId: string, where: Source['where'], quote: string): Source => ({ fileId, where, quote, quoteChecked: true })
  const open = async (s: Source, name: string) => {
    renderWithProject(<SourceChip source={s} />, '/', project)
    await userEvent.click(screen.getByRole('button', { name }))
    return screen.getByRole('dialog', { name: 'Source' })
  }

  it('document PDF: "Spec · p.2" chip, drawer shows the page without a panel', async () => {
    const drawer = await open(make('f-document', { page: 2, bbox: [20, 30, 40, 8] }, 'Net wt 340 g'), 'Spec · p.2')
    expect(within(drawer).getByRole('heading', { name: 'Document · page 2' })).toBeInTheDocument()
    expect(within(drawer).getByRole('img', { name: 'Page with the quote highlighted' })).toBeInTheDocument()
    expect(drawer.querySelector('rect[data-highlight]')).not.toBeNull()
  })

  it('notes: "Notes · line 4" chip, drawer quotes the line', async () => {
    const drawer = await open(make('f-text', { line: 4 }, 'Contains almonds'), 'Notes · line 4')
    expect(within(drawer).getByRole('heading', { name: 'Notes · line 4' })).toBeInTheDocument()
    expect(drawer.querySelector('[data-target]')).toHaveTextContent('Contains almonds')
    expect(within(drawer).getByText('Line 4 of the original, quote highlighted')).toBeInTheDocument()
  })

  it('Word: "Word · ¶7" chip, drawer quotes the paragraph', async () => {
    const drawer = await open(make('f-docx', { paragraph: 7 }, 'Net weight: 340 g'), 'Word · ¶7')
    expect(within(drawer).getByRole('heading', { name: 'Word document · paragraph 7' })).toBeInTheDocument()
    expect(within(drawer).getByTestId('text-locator')).toHaveTextContent('¶7')
    expect(drawer.querySelector('[data-target]')).toHaveTextContent('Net weight: 340 g')
  })

  it('image: "Image" chip, drawer says the picture needs the backend in mock mode', async () => {
    const drawer = await open(make('f-image', { page: 1, bbox: [1, 2, 3, 4] }, 'Vegan'), 'Image')
    expect(within(drawer).getByRole('heading', { name: 'Image' })).toBeInTheDocument()
    expect(within(drawer).getByText(/only shown when connected to the backend/)).toBeInTheDocument()
  })
})
