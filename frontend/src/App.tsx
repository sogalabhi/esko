import { Navigate, Route, Routes } from 'react-router'
import { LoadGate } from './components/LoadGate'
import { Evidence } from './screens/Evidence'
import { Facts } from './screens/Facts'
import { Questions } from './screens/Questions'
import { AppShell, NotBuilt } from './shell/AppShell'
import { ProjectProvider } from './state/project'

export default function App() {
  return (
    <ProjectProvider>
      <AppShell>
        <Routes>
          <Route path="/" element={<Navigate to="/facts" replace />} />
          <Route path="/evidence" element={<Evidence />} />
          <Route path="/facts" element={<LoadGate><Facts /></LoadGate>} />
          <Route path="/questions" element={<LoadGate><Questions /></LoadGate>} />
          <Route path="/pack" element={<NotBuilt title="Pack" phase="6" />} />
          <Route path="/brief" element={<NotBuilt title="Brief" phase="5" />} />
          <Route path="/rules" element={<NotBuilt title="Rules map" phase="7" />} />
          <Route path="/claims" element={<NotBuilt title="Claims" phase="7" />} />
          <Route path="/trust" element={<NotBuilt title="Trust" phase="8" />} />
          <Route path="*" element={<NotBuilt title="Page not found" phase="—" />} />
        </Routes>
      </AppShell>
    </ProjectProvider>
  )
}
