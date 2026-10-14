import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

afterEach(() => vi.unstubAllGlobals())

const renderAt = (route: string) =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>,
  )

const healthy = () =>
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', ai: { provider: 'gemini', model: 'm-1', keySet: true } }),
    }),
  )

describe('App', () => {
  it('shows Backend OK with provider and model', async () => {
    healthy()
    renderAt('/')
    const status = await screen.findByRole('status')
    await within(status).findAllByText('Backend OK')
    expect(status).toHaveAttribute('title', 'gemini / m-1')
  })

  it('shows Backend unreachable when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    renderAt('/')
    expect((await screen.findAllByText('Backend unreachable')).length).toBeGreaterThan(0)
  })

  it('opens on Facts with the shell: product, market, health, rail', async () => {
    healthy()
    renderAt('/')
    expect(screen.getByText('Granola — Berry Crunch · 480 g')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'United States' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('img', { name: /Brief health: \d+% proven, \d+ open/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Facts', level: 1 })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Steps' })
    for (const l of ['Evidence', 'Facts', 'Questions', 'Pack', 'Brief', 'Rules map', 'Claims', 'Trust']) {
      expect(within(nav).getAllByText(l).length).toBeGreaterThan(0)
    }
    await screen.findAllByText('Backend OK')
  })

  it('shows an empty state on screens not built yet, and Reset demo restores state', async () => {
    healthy()
    renderAt('/facts')
    await userEvent.click(screen.getAllByRole('button', { name: 'Use left' })[0])
    expect(screen.getByText(/· 14 open/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reset demo' }))
    expect(screen.getByText(/· 15 open/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: /Pack/ }))
    expect(screen.getByText('Built in Phase 6.')).toBeInTheDocument()
  })
})
