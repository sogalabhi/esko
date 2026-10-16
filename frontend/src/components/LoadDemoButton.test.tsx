import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { demoApi } from '../api/demo'
import { api } from '../api/client'
import { ProjectProvider, mockProject } from '../state/project'
import { LoadDemoButton } from './LoadDemoButton'

afterEach(() => vi.restoreAllMocks())

const renderApi = () =>
  render(
    <MemoryRouter>
      <ProjectProvider initial={mockProject} source="api">
        <LoadDemoButton />
      </ProjectProvider>
    </MemoryRouter>,
  )

describe('LoadDemoButton', () => {
  it('calls load, then refreshes the project store, then shows the toast', async () => {
    const order: string[] = []
    vi.spyOn(demoApi, 'status').mockResolvedValue({ available: true, savedAt: '2026-10-16T08:40:38+00:00' })
    vi.spyOn(demoApi, 'load').mockImplementation(async () => {
      order.push('load')
      return mockProject
    })
    const getProject = vi.spyOn(api, 'getProject').mockImplementation(async () => {
      order.push('refresh')
      return mockProject
    })
    renderApi()
    await waitFor(() => expect(screen.getByRole('button', { name: /Load demo/ })).toBeEnabled())
    getProject.mockClear()
    order.length = 0
    await userEvent.click(screen.getByRole('button', { name: /Load demo/ }))
    expect(await screen.findByText('Demo data loaded')).toBeInTheDocument()
    expect(order).toEqual(['load', 'refresh'])
  })

  it('is disabled with the reason when no snapshot exists', async () => {
    vi.spyOn(demoApi, 'status').mockResolvedValue({ available: false, savedAt: null })
    vi.spyOn(api, 'getProject').mockResolvedValue(mockProject)
    const load = vi.spyOn(demoApi, 'load')
    renderApi()
    expect(await screen.findByText(/No demo snapshot has been saved yet/)).toBeInTheDocument()
    const btn = screen.getByRole('button', { name: /Load demo/ })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAccessibleDescription(/No demo snapshot/)
    await userEvent.click(btn)
    expect(load).not.toHaveBeenCalled()
  })

  it('is disabled with a reason on the mock data source', () => {
    render(
      <MemoryRouter>
        <ProjectProvider>
          <LoadDemoButton />
        </ProjectProvider>
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: /Load demo/ })).toBeDisabled()
    expect(screen.getByText(/needs the backend/)).toBeInTheDocument()
  })

  it('shows the backend reason when loading fails', async () => {
    vi.spyOn(demoApi, 'status').mockResolvedValue({ available: true, savedAt: 'x' })
    vi.spyOn(api, 'getProject').mockResolvedValue(mockProject)
    vi.spyOn(demoApi, 'load').mockRejectedValue(new Error('No demo snapshot has been saved yet.'))
    renderApi()
    await waitFor(() => expect(screen.getByRole('button', { name: /Load demo/ })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: /Load demo/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No demo snapshot')
    expect(screen.queryByText('Demo data loaded')).toBeNull()
  })
})
