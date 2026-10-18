import { Navigate, Route, Routes } from 'react-router'
import { LoadGate } from './components/LoadGate'
import { Evidence } from './screens/Evidence'
import { Brief } from './screens/Brief'
import { Facts } from './screens/Facts'
import { Markup } from './screens/Markup'
import { Pack } from './screens/Pack'
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
          <Route path="/pack" element={<LoadGate><Pack /></LoadGate>} />
          <Route path="/brief" element={<LoadGate><Brief /></LoadGate>} />
          <Route path="/markup" element={<LoadGate><Markup /></LoadGate>} />
          <Route path="/rules" element={<NotBuilt title="Rules map" phase="7" />} />
          <Route path="/claims" element={<NotBuilt title="Claims" phase="7" />} />
          <Route path="/trust" element={<NotBuilt title="Trust" phase="8" />} />
          <Route path="*" element={<NotBuilt title="Page not found" phase="—" />} />
        </Routes>
      </AppShell>
    </ProjectProvider>
  )
}
