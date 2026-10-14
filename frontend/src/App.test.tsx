import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

afterEach(() => vi.unstubAllGlobals())

describe('App', () => {
  it('shows Backend OK with provider and model', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ok', ai: { provider: 'gemini', model: 'm-1', keySet: true } }),
      }),
    )
    render(<App />)
    expect(await screen.findByText('Backend OK')).toBeInTheDocument()
    expect(screen.getByText(/gemini \/ m-1/)).toBeInTheDocument()
  })

  it('shows Backend unreachable when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    render(<App />)
    expect(await screen.findByText('Backend unreachable')).toBeInTheDocument()
  })
})
