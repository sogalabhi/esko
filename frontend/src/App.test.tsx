import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App, { Home } from './App'
import { EMPTY_PROJECT } from './api/client'
import { renderWithProject } from './test/render'

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

  it('opens on Checks when the project has files, with the shell: product, market, verdict line, rail', async () => {
    healthy()
    renderAt('/')
    expect(screen.getByText('Granola — Berry Crunch · 480 g')).toBeInTheDocument()
    expect(screen.getByLabelText('Market: United States')).toHaveTextContent('United States')
    expect(screen.getByRole('link', { name: /Print verdict: not ready to print, 4 fail and 2 to review/ })).toHaveTextContent('Not ready to print: 4 fail · 2 review')
    expect(screen.getByRole('heading', { name: 'Checks', level: 1 })).toBeInTheDocument()
    await screen.findAllByText('Backend OK')
  })

  it('opens on Files when nothing is uploaded yet', () => {
    renderWithProject(
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/evidence" element={<p>Files screen</p>} />
        <Route path="/checks" element={<p>Checks screen</p>} />
      </Routes>,
      '/',
      EMPTY_PROJECT,
    )
    expect(screen.getByText('Files screen')).toBeInTheDocument()
  })

  it('rail: Files, What we read, Rules, Checks, Marked-up artwork, Report, then 3D pack under More tools; no Questions', async () => {
    healthy()
    renderAt('/checks')
    const nav = screen.getByRole('navigation', { name: 'Steps' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/evidence', '/facts', '/rules', '/checks', '/markup', '/report', '/pack'])
    const names = ['1 Files', '2 What we read', '3 Rules', '4 Checks', '5 Marked-up artwork', '6 Report', '3D pack']
    names.forEach((n, i) => expect(links[i]).toHaveTextContent(n.replace(/^\d /, '')))
    expect(within(nav).queryByRole('link', { name: /Questions/ })).toBeNull()
    expect(within(nav).getByRole('separator')).toBeInTheDocument()
    await screen.findAllByText('Backend OK')
  })

  it('keeps the Questions route and the renamed headings', async () => {
    healthy()
    const { unmount } = renderAt('/questions')
    expect(screen.getByRole('heading', { name: 'Questions', level: 1 })).toBeInTheDocument()
    unmount()
    const facts = renderAt('/facts')
    expect(screen.getByRole('heading', { name: 'What we read', level: 1 })).toBeInTheDocument()
    facts.unmount()
    const report = renderAt('/report')
    expect(screen.getByRole('heading', { name: 'Report', level: 1 })).toBeInTheDocument()
    report.unmount()
  })

  it('hides the Problem 1 brief and the unbuilt screens: not in the rail, and their links lead nowhere', async () => {
    healthy()
    renderAt('/facts')
    const nav = screen.getByRole('navigation', { name: 'Steps' })
    for (const l of [/Brief/, /Rules map/, /Claims/, /Trust/]) {
      expect(within(nav).queryByRole('link', { name: l })).toBeNull()
    }
    for (const route of ['/brief', '/claims', '/trust']) {
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
    await userEvent.click(screen.getByRole('link', { name: /3D pack/ }))
    expect(screen.getByRole('heading', { level: 1, name: /Pack \(3D View\)/i })).toBeInTheDocument()
  })
})
