import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CURRENT_USER } from '../state/project'
import { renderWithProject } from '../test/render'
import { Facts } from './Facts'

const rows = () => [...document.querySelectorAll<HTMLTableRowElement>('tr[data-fact]')]

describe('Facts screen', () => {
  it('groups facts into the eight sections with the four columns', () => {
    renderWithProject(<Facts />)
    for (const g of ['Identity', 'Ingredients', 'Allergens', 'Nutrition', 'Quantity & barcode', 'Claims & marks', 'Company & address', 'Packaging']) {
      expect(screen.getByRole('columnheader', { name: g })).toBeInTheDocument()
    }
    for (const c of ['Field', 'Value', 'State', 'Sources']) expect(screen.getByRole('columnheader', { name: c })).toBeInTheDocument()
  })

  it('"Conflicts" filter shows only rows with open conflicts', async () => {
    renderWithProject(<Facts />)
    const all = rows().length
    await userEvent.click(screen.getByRole('button', { name: /^Conflicts \d+$/ }))
    const shown = rows()
    expect(shown.length).toBeGreaterThan(0)
    expect(shown.length).toBeLessThan(all)
    for (const r of shown) {
      expect(r).toHaveAttribute('data-conflict')
      expect(within(r).getByText('Conflict')).toBeInTheDocument()
    }
    expect(screen.queryByRole('rowheader', { name: 'Brand' })).toBeNull()
    expect(screen.getByRole('rowheader', { name: 'Honey %' })).toBeInTheDocument()
  })

  it('other filters: AI-suggested, Missing, Passed', async () => {
    renderWithProject(<Facts />)
    await userEvent.click(screen.getByRole('button', { name: /^AI-suggested \d+$/ }))
    expect(screen.getByRole('rowheader', { name: 'Label ID' })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'BPN' })).toBeInTheDocument()
    rows().forEach((r) => expect(within(r).getByText('AI-suggested')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /^Missing \d+$/ }))
    expect(screen.getByRole('rowheader', { name: 'Address (city, state, ZIP)' })).toBeInTheDocument()
    rows().forEach((r) => expect(within(r).getByText('Missing')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /^Passed \d+$/ }))
    expect(rows()).toHaveLength(1)
    expect(screen.getByRole('rowheader', { name: 'UPC' })).toBeInTheDocument()
    expect(screen.getByText('Pass')).toBeInTheDocument()
  })

  it('shows the ingredient diff: carton-only items, and the duplicate in the sheet', () => {
    renderWithProject(<Facts />)
    const diff = screen.getByRole('region', { name: 'Ingredient list diff' })
    const added = [...diff.querySelectorAll('[data-diff="added"]')].map((e) => e.textContent)
    expect(added.join('|')).toMatch(/Walnuts.*Flax Seeds.*Dried Strawberries.*Pumpkin Seeds/)
    expect(added).toHaveLength(4)
    const dup = [...diff.querySelectorAll('[data-diff="duplicate"]')].map((e) => e.textContent)
    expect(dup).toHaveLength(1)
    expect(dup[0]).toContain('Sunflower Seeds')
  })

  it('conflicts column is sorted by severity and resolving updates local state', async () => {
    renderWithProject(<Facts />)
    const aside = screen.getByRole('complementary', { name: /Conflicts/ })
    expect(within(aside).getByText('· 15 open')).toBeInTheDocument()
    const sev = [...aside.querySelectorAll('article header')].map((h) => (h.textContent?.includes('High') ? 0 : 1))
    expect(sev).toEqual([...sev].sort())

    const honeyCard = within(aside).getByText('The content sheet and the carton give different honey percentages.').closest('article')!
    await userEvent.click(within(honeyCard as HTMLElement).getByRole('button', { name: 'Use left' }))
    expect(within(aside).getByText(`Resolved by ${CURRENT_USER} · use sheet value`)).toBeInTheDocument()
    expect(within(aside).getByText('· 14 open')).toBeInTheDocument()
  })
})
