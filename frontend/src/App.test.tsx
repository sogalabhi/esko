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
    expect(screen.getByLabelText('Market: United States')).toHaveTextContent('United States')
    expect(screen.getByRole('img', { name: /Required items: \d+% met, \d+ open/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Facts', level: 1 })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Steps' })
    for (const l of ['Evidence', 'Facts', 'Questions', 'Pack', 'Markup']) {
      expect(within(nav).getAllByText(l).length).toBeGreaterThan(0)
    }
    await screen.findAllByText('Backend OK')
  })

  it('hides the Problem 1 brief and the unbuilt screens: not in the rail, and their links lead nowhere', async () => {
    healthy()
    renderAt('/facts')
    const nav = screen.getByRole('navigation', { name: 'Steps' })
    for (const l of [/Brief/, /Rules map/, /Claims/, /Trust/]) {
      expect(within(nav).queryByRole('link', { name: l })).toBeNull()
    }
    for (const route of ['/brief', '/rules', '/claims', '/trust']) {
      const { unmount } = renderAt(route)
      expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
      expect(screen.queryByText(/Built in Phase/)).toBeNull()
      unmount()
    }
  })

  it('Reset demo restores state, and the rail still reaches the 3D pack', async () => {
    healthy()
    renderAt('/facts')
    await userEvent.click(screen.getAllByRole('button', { name: 'Use left' })[0])
    expect(screen.getByText(/· 14 open/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reset demo' }))
    expect(screen.queryByText(/· 14 open/)).toBeNull()
    await userEvent.click(screen.getByRole('link', { name: /Pack/ }))
    expect(screen.getByRole('heading', { level: 1, name: /Pack \(3D View\)/i })).toBeInTheDocument()
  })
})
