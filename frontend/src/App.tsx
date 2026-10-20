import { Navigate, Route, Routes } from 'react-router'
import { LoadGate } from './components/LoadGate'
import { Checks, EmptyChecks } from './screens/Checks'
import { Evidence } from './screens/Evidence'
import { Facts } from './screens/Facts'
import { Markup } from './screens/Markup'
import { Pack } from './screens/Pack'
import { Questions } from './screens/Questions'
import { EmptyReport, Report } from './screens/Report'
import { AppShell, NotFound } from './shell/AppShell'
import { ProjectProvider } from './state/project'

// Problem 2 pivot: the Brief screen (screens/Brief.tsx) and the Rules map, Claims and Trust placeholders are
// off the routes, not deleted. Each one comes back when its phase in docs/PHASES.md rebuilds it.
export default function App() {
  return (
    <ProjectProvider>
      <AppShell>
        <Routes>
          <Route path="/" element={<Navigate to="/checks" replace />} />
          <Route path="/evidence" element={<Evidence />} />
          <Route path="/checks" element={<LoadGate empty={<EmptyChecks />}><Checks /></LoadGate>} />
          <Route path="/report" element={<LoadGate empty={<EmptyReport />}><Report /></LoadGate>} />
          <Route path="/facts" element={<LoadGate><Facts /></LoadGate>} />
          <Route path="/questions" element={<LoadGate><Questions /></LoadGate>} />
          <Route path="/pack" element={<LoadGate><Pack /></LoadGate>} />
          <Route path="/markup" element={<LoadGate><Markup /></LoadGate>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AppShell>
    </ProjectProvider>
  )
}
