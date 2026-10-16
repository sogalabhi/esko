import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import { LoadGate } from '../components/LoadGate'
import { SourceDrawer } from '../shell/SourceDrawer'
import { ProjectProvider } from '../state/project'

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response> | undefined

/** Stub fetch with handlers tried in order; an unhandled call is a 500 so the test notices. */
export function stubFetch(...handlers: Handler[]) {
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    for (const h of handlers) {
      const r = h(url, init)
      if (r) return r
    }
    return json({ detail: `unhandled ${init?.method ?? 'GET'} ${url}` }, 500)
  })
  vi.stubGlobal('fetch', f)
  return f
}

export const get = (path: string, res: () => Response): Handler => (url, init) =>
  url === path && (init?.method ?? 'GET') === 'GET' ? res() : undefined

export const post = (path: string, res: (init?: RequestInit) => Response | Promise<Response>): Handler => (url, init) =>
  url === path && init?.method === 'POST' ? res(init) : undefined

/** Requests made through the stub, in order. The demo-availability check (/api/demo) is ignored: it is a background probe. */
export const calls = (f: ReturnType<typeof stubFetch>) =>
  f.mock.calls.map(([u, i]) => `${i?.method ?? 'GET'} ${u}`).filter((c) => !/ \/api\/demo$/.test(c))

/** Render against the real data source (fetch is stubbed by the test). */
export function renderLive(ui: ReactElement, { route = '/', gate = false } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <ProjectProvider source="api">
        {gate ? <LoadGate>{ui}</LoadGate> : ui}
        <SourceDrawer />
      </ProjectProvider>
    </MemoryRouter>,
  )
}
