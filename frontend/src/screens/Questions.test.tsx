import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { mockProject } from '../state/project'
import { renderWithProject } from '../test/render'
import { rankQuestions } from '../lib/questions'
import { Questions } from './Questions'

const items = () => [...document.querySelectorAll<HTMLElement>('li[data-question]')]
const ids = () => items().map((l) => l.dataset.question!)
const item = (id: string) => document.querySelector<HTMLElement>(`li[data-question="${id}"]`)!
const card = (id: string) => within(item(id)).getByRole('article')
const progress = () => screen.getByTestId('questions-progress')
const total = mockProject.questions.length

describe('Questions screen', () => {
  it('ranks cards by unlocks, most first', () => {
    renderWithProject(<Questions />)
    const unlocks = ids().map((id) => mockProject.questions.find((q) => q.id === id)!.unlocks)
    expect(unlocks).toEqual([...unlocks].sort((a, b) => b - a))
    expect(ids()[0]).toBe('q-vegan')
    expect(rankQuestions(mockProject.questions).map((q) => q.id)).toEqual(ids())
  })

  it('answering collapses the card, updates the progress line and the affected requirement', async () => {
    renderWithProject(<Questions />)
    expect(progress()).toHaveTextContent(`0 of ${total} answered · 0 requirements unlocked`)
    await userEvent.click(within(item('q-vegan')).getByRole('button', { name: /Keep honey, remove vegan claims/ }))
    expect(item('q-vegan')).toHaveAttribute('data-status', 'answered')
    expect(within(item('q-vegan')).getByText('Answered · Keep honey, remove vegan claims')).toBeInTheDocument()
    expect(within(item('q-vegan')).queryByRole('button', { name: 'Skip for now' })).toBeNull()
    expect(progress()).toHaveTextContent(`1 of ${total} answered · 4 requirements unlocked`)
    expect(document.querySelector('[data-req="req-vegan"]')).toHaveAttribute('data-shown', 'decided')
    expect(screen.getByRole('status')).toHaveTextContent('Answer applied to 4 items')
  })

  it('Undo restores the card and the progress line', async () => {
    renderWithProject(<Questions />)
    await userEvent.click(within(item('q-nas')).getByRole('button', { name: /Remove the claim/ }))
    expect(progress()).toHaveTextContent(`1 of ${total} answered · 3 requirements unlocked`)
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(item('q-nas')).toHaveAttribute('data-status', 'open')
    expect(within(item('q-nas')).getByRole('button', { name: /Remove the claim/ })).toBeInTheDocument()
    expect(progress()).toHaveTextContent(`0 of ${total} answered · 0 requirements unlocked`)
    expect(document.querySelector('[data-req="req-nas"]')).toHaveAttribute('data-shown', 'conflict')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('J/K move between cards and 1–4 pick an answer', async () => {
    renderWithProject(<Questions />)
    const order = ids()
    await userEvent.keyboard('j')
    expect(card(order[0])).toHaveFocus()
    await userEvent.keyboard('j')
    expect(card(order[1])).toHaveFocus()
    await userEvent.keyboard('k')
    expect(card(order[0])).toHaveFocus()
    await userEvent.keyboard('j')
    await userEvent.keyboard('2')
    expect(item('q-nas')).toHaveAttribute('data-status', 'answered')
    expect(within(item('q-nas')).getByText('Answered · Change the recipe (R&D to confirm)')).toBeInTheDocument()
    // Focus moves on to the next open card; 1 answers it.
    expect(card(order[2])).toHaveFocus()
    await userEvent.keyboard('1')
    expect(item(order[2])).toHaveAttribute('data-status', 'answered')
    expect(progress()).toHaveTextContent(`2 of ${total} answered`)
  })

  it('1 answers the top card with nothing focused', async () => {
    renderWithProject(<Questions />)
    await userEvent.keyboard('1')
    expect(item('q-vegan')).toHaveAttribute('data-status', 'answered')
  })

  it('"Skip for now" moves on and sends the card to the end', async () => {
    renderWithProject(<Questions />)
    await userEvent.click(within(item('q-vegan')).getByRole('button', { name: 'Skip for now' }))
    expect(ids()[0]).toBe('q-nas')
    expect(ids().at(-1)).toBe('q-vegan')
    expect(within(item('q-vegan')).getByText('Skipped for now')).toBeInTheDocument()
    expect(card('q-nas')).toHaveFocus()
    expect(progress()).toHaveTextContent(`0 of ${total} answered`)
  })
})
