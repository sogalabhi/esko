import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DEFAULT_ACCENT, DEFAULT_FOOTER, type Letterhead as Settings } from '../../lib/letterhead'
import { DraftWatermark, Letterhead, type DocMeta } from './Letterhead'

const blank: Settings = { company: '', logo: null, accent: DEFAULT_ACCENT, preparedFor: '', preparedBy: '', reference: '', footer: DEFAULT_FOOTER }
const meta: DocMeta = { product: 'Granola — Berry Crunch', quantity: '480 g', version: 3, market: 'United States', date: '18 October 2026' }

describe('Letterhead', () => {
  it('with no settings shows the product, not a company or logo', () => {
    render(<Letterhead settings={blank} meta={meta} />)
    const head = screen.getByTestId('letterhead')
    expect(head).toHaveTextContent('Design brief')
    expect(head).toHaveTextContent('Granola — Berry Crunch · 480 g')
    expect(screen.queryByRole('img')).toBeNull()
    expect(head.querySelector('.doc-company')).toBeNull()
    expect(head).not.toHaveTextContent('Reference')
    expect(head).not.toHaveTextContent('Prepared for')
    expect(screen.getByTestId('doc-status')).toHaveTextContent('Draft')
  })

  it('shows the company name, the logo with the company as alt text, and the meta row', () => {
    const s = { ...blank, company: 'Acme Foods', logo: 'data:image/png;base64,AAAA', preparedFor: 'Studio North', preparedBy: 'Priya', reference: 'PKG-0042' }
    render(<Letterhead settings={s} meta={{ ...meta, approvedBy: 'Priya', approvedAt: '17 Oct 2026, 14:05' }} />)
    expect(screen.getByRole('img', { name: 'Acme Foods' })).toHaveAttribute('src', s.logo)
    const head = screen.getByTestId('letterhead')
    for (const t of ['Acme Foods', 'ReferencePKG-0042', 'Versionv3', 'MarketUnited States', 'Date18 October 2026', 'Prepared forStudio North', 'Prepared byPriya'])
      expect(head).toHaveTextContent(t)
    expect(screen.getByTestId('doc-status')).toHaveTextContent('Approved by Priya · 17 Oct 2026, 14:05')
  })

  it('the watermark says DRAFT and is hidden from assistive tech', () => {
    render(<DraftWatermark />)
    const w = screen.getByTestId('draft-watermark')
    expect(w).toHaveTextContent('DRAFT · NOT APPROVED')
    expect(w).toHaveAttribute('aria-hidden', 'true')
    expect(w).toHaveClass('print-only')
  })
})
