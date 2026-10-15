import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { LeftRail } from '../shell/LeftRail'
import { renderWithProject } from '../test/render'
import { Facts } from './Facts'

beforeEach(() => window.localStorage.clear())

describe('left rail toggle', () => {
  it('collapses to icons only, sets aria-expanded and remembers the choice', async () => {
    const { unmount } = renderWithProject(<LeftRail />)
    const nav = screen.getByRole('navigation', { name: 'Steps' })
    const btn = within(nav).getByRole('button', { name: 'Collapse navigation' })
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    expect(nav).not.toHaveAttribute('data-collapsed')

    await userEvent.click(btn)
    const open = within(nav).getByRole('button', { name: 'Expand navigation' })
    expect(open).toHaveAttribute('aria-expanded', 'false')
    expect(nav).toHaveAttribute('data-collapsed')
    expect(window.localStorage.getItem('bf.rail.collapsed')).toBe('1')

    unmount()
    renderWithProject(<LeftRail />)
    expect(screen.getByRole('navigation', { name: 'Steps' })).toHaveAttribute('data-collapsed')
  })
})

describe('conflicts column toggle', () => {
  it('collapses to a strip with the open count and reopens', async () => {
    renderWithProject(<Facts />)
    await userEvent.click(screen.getByRole('button', { name: 'Collapse conflicts' }))
    expect(screen.queryByRole('heading', { name: /Conflicts/ })).toBeNull()
    const strip = screen.getByRole('button', { name: 'Show conflicts, 15 open' })
    expect(strip).toHaveAttribute('aria-expanded', 'false')
    expect(strip).toHaveTextContent('15')
    expect(strip).toHaveTextContent('open')
    expect(window.localStorage.getItem('bf.conflicts.collapsed')).toBe('1')

    await userEvent.click(strip)
    expect(screen.getByRole('button', { name: 'Collapse conflicts' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('complementary', { name: /Conflicts/ })).toBeInTheDocument()
  })

  it('starts collapsed when remembered', () => {
    window.localStorage.setItem('bf.conflicts.collapsed', '1')
    renderWithProject(<Facts />)
    expect(screen.getByRole('button', { name: /Show conflicts/ })).toBeInTheDocument()
  })
})

describe('ingredients Expand', () => {
  it('opens the diff in a dialog, Esc closes it and focus returns to the button', async () => {
    renderWithProject(<Facts />)
    const btn = screen.getByRole('button', { name: 'Expand ingredient list diff' })
    expect(btn).toHaveAttribute('aria-haspopup', 'dialog')
    await userEvent.click(btn)
    const dlg = screen.getByRole('dialog', { name: 'ingredient list diff' })
    expect(dlg).toHaveAttribute('aria-modal', 'true')
    expect(within(dlg).getByRole('button', { name: 'Close' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(btn).toHaveFocus()
  })

  it('opens the ingredient list full width and the Close button dismisses it', async () => {
    renderWithProject(<Facts />)
    const btn = screen.getByRole('button', { name: 'Expand Ingredient list' })
    await userEvent.click(btn)
    const dlg = screen.getByRole('dialog', { name: 'Ingredient list' })
    expect(dlg).toHaveTextContent(/Oat Flakes/)
    await userEvent.click(within(dlg).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(btn).toHaveFocus()
  })
})
