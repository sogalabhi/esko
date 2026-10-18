import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_ACCENT, DEFAULT_FOOTER, type Letterhead } from '../../lib/letterhead'
import { LetterheadSettings } from './LetterheadSettings'

const blank: Letterhead = { company: '', logo: null, accent: DEFAULT_ACCENT, preparedFor: '', preparedBy: '', reference: '', footer: DEFAULT_FOOTER }

function Harness({ onClose = () => {}, persisted }: { onClose?: () => void; persisted?: boolean }) {
  const [s, setS] = useState(blank)
  return <LetterheadSettings settings={s} onChange={(p) => setS((x) => ({ ...x, ...p }))} onClose={onClose} persisted={persisted} />
}

const user = () => userEvent.setup({ applyAccept: false })

describe('LetterheadSettings', () => {
  it('has labelled fields for every setting', () => {
    render(<Harness />)
    for (const l of ['Company name', 'Reference / project code', 'Prepared for', 'Prepared by', 'Footer note', 'Accent colour', /Logo/])
      expect(screen.getByLabelText(l)).toBeInTheDocument()
    expect(screen.getByLabelText('Footer note')).toHaveValue(DEFAULT_FOOTER)
    expect(screen.getByLabelText('Accent colour')).toHaveValue(DEFAULT_ACCENT)
  })

  it('rejects a logo over 1 MB with a clear message', async () => {
    render(<Harness />)
    const big = new File([new Uint8Array(1024 * 1024 + 1)], 'logo.png', { type: 'image/png' })
    await user().upload(screen.getByLabelText(/Logo/), big)
    expect(await screen.findByRole('alert')).toHaveTextContent('The logo is 1.0 MB. Use an image of 1 MB or less.')
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('rejects a file that is not an image', async () => {
    render(<Harness />)
    await user().upload(screen.getByLabelText(/Logo/), new File(['%PDF'], 'brief.pdf', { type: 'application/pdf' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The logo must be a PNG, JPG or SVG image.')
  })

  it('reads a good logo to a data URL with a preview, and removes it', async () => {
    render(<Harness />)
    await userEvent.type(screen.getByLabelText('Company name'), 'Acme')
    await user().upload(screen.getByLabelText(/Logo/), new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'logo.svg', { type: 'image/svg+xml' }))
    const img = await screen.findByRole('img', { name: 'Logo preview for Acme' })
    expect(img.getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
    expect(screen.queryByRole('alert')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Remove logo' }))
    await waitFor(() => expect(screen.queryByRole('img')).toBeNull())
  })

  it('says when the browser did not keep the settings, and closes on Escape', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} persisted={false} />)
    expect(screen.getByRole('status')).toHaveTextContent('they last for this visit only')
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
