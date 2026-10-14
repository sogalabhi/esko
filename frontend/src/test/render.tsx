import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import { SourceDrawer } from '../shell/SourceDrawer'
import { ProjectProvider } from '../state/project'

/** Render inside the router, the project store (mock data) and the source drawer. */
export function renderWithProject(ui: ReactElement, route = '/') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <ProjectProvider>
        {ui}
        <SourceDrawer />
      </ProjectProvider>
    </MemoryRouter>,
  )
}
