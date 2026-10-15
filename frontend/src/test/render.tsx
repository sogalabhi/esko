import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import { SourceDrawer } from '../shell/SourceDrawer'
import { ProjectProvider } from '../state/project'
import type { Project } from '../types/project'

/** Render inside the router, the project store (mock data) and the source drawer. */
export function renderWithProject(ui: ReactElement, route = '/', initial?: Project) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <ProjectProvider initial={initial}>
        {ui}
        <SourceDrawer />
      </ProjectProvider>
    </MemoryRouter>,
  )
}
