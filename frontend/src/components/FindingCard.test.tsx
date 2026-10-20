import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { mockProject } from '../state/project'
import { renderWithProject } from '../test/render'
import type { Finding } from '../types/project'
import { FindingCard } from './FindingCard'

const find = (id: string): Finding => mockProject.findings.find((f) => f.id === id)!

describe('FindingCard', () => {
  it('a code-checked fail shows verdict, why it matters, rules, evidence, expected vs found and the proof', () => {
    const f = find('f-math-dv-total-fat')
    renderWithProject(<FindingCard finding={f} />)
    const card = screen.getByRole('article', { name: f.title })
    expect(within(card).getByText('Fail')).toBeInTheDocument()
    expect(within(card).getByText(f.whyItMatters)).toBeInTheDocument()
    // Market rule chip and rulebook rule chip (shows the rulebook title).
    expect(within(card).getByText('21 CFR 101.9')).toBeInTheDocument()
    expect(within(card).getByText('DF-10')).toBeInTheDocument()
    expect(within(card).getByText('Daily values and calories')).toBeInTheDocument()
    // Evidence: chip, checked quote, and a crop.
    expect(within(card).getByRole('button', { name: /Carton · Left/ })).toBeInTheDocument()
    expect(within(card).getByText('Quote checked by code')).toBeInTheDocument()
    expect(within(card).getByText('Total Fat 15g 2.2%')).toBeInTheDocument()
    expect(card.querySelector('[data-crop]')).not.toBeNull()
    // Expected vs found and the proof.
    expect(card.querySelector('[data-expected]')).toHaveTextContent('19%')
    expect(card.querySelector('[data-found]')).toHaveTextContent('2.2%')
    expect(within(card).getByText('Checked by code')).toBeInTheDocument()
    expect(within(card).getByText(f.proof!)).toBeInTheDocument()
    expect(within(card).queryByText(/a person decides/)).toBeNull()
  })

  it('an AI-basis card says a person decides, shows an unchecked quote and offers the decision', () => {
    const f = find('f-claim-vegan')
    expect(f.basis).toBe('ai')
    renderWithProject(<FindingCard finding={f} />)
    const card = screen.getByRole('article', { name: f.title })
    expect(within(card).getByText('Needs review')).toBeInTheDocument()
    expect(within(card).getByText('AI judgement — a person decides')).toBeInTheDocument()
    expect(within(card).getByText('Quote not checked')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: "It's fine" })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: "It's a problem" })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Ask someone' })).toBeInTheDocument()
  })

  it('an unverified rulebook rule is marked unverified in words', () => {
    const p = structuredClone(mockProject)
    const f = { ...find('f-missing-address'), ruleIds: ['DF-06'] }
    renderWithProject(<FindingCard finding={f} />, '/', p)
    expect(screen.getByText('unverified')).toBeInTheDocument()
    expect(screen.getByRole('tooltip', { hidden: true })).toHaveTextContent(/could not be found in the rulebook/)
  })

  it('"Show on artwork" links to the markup focused on the finding, only when it has locations', () => {
    const { unmount } = renderWithProject(<FindingCard finding={find('f-mismatch-honey')} />)
    expect(screen.getByRole('link', { name: 'Show on artwork' })).toHaveAttribute('href', '/markup?finding=f-mismatch-honey')
    unmount()
    renderWithProject(<FindingCard finding={find('f-pass-identity')} />)
    expect(screen.queryByRole('link', { name: 'Show on artwork' })).toBeNull()
  })

  it('a decided review item shows who, when and the note, and no controls', () => {
    const f = find('f-approval-sheet-draft')
    renderWithProject(<FindingCard finding={f} />)
    const card = screen.getByRole('article', { name: f.title })
    expect(within(card).getByText('Decided: fine')).toBeInTheDocument()
    expect(within(card).getByText(/Sam Lee \(Regulatory\) decided: it's fine/)).toBeInTheDocument()
    expect(card.querySelector('time')).toHaveAttribute('datetime', f.decision!.at)
    expect(within(card).getByText(/Sheet v4 approved by email/)).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: "It's fine" })).toBeNull()
  })

  it('opens the source drawer from an evidence chip and can hide the crops', async () => {
    renderWithProject(<FindingCard finding={find('f-mismatch-honey')} />)
    await userEvent.click(screen.getByRole('button', { name: 'Hide crops' }))
    expect(document.querySelector('[data-crop]')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /Sheet · B26/ }))
    expect(await screen.findByRole('dialog', { name: 'Source' })).toHaveTextContent('Honey (9%)')
  })

  it('Ask someone shows a message to copy and marks the item as waiting', async () => {
    renderWithProject(<FindingCard finding={find('f-claim-vegan')} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ask someone' }))
    expect((screen.getByLabelText('Message to copy') as HTMLTextAreaElement).value).toContain('Vegan claim with honey in the recipe')
    expect(screen.getByText(/Waiting for/)).toBeInTheDocument()
  })
})
