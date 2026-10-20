import { Construction } from 'lucide-react'
import { useCallback, useState, type ReactNode } from 'react'
import { AskPanel } from './AskPanel'
import { LeftRail } from './LeftRail'
import { SourceDrawer } from './SourceDrawer'
import { TopBar } from './TopBar'

export function AppShell({ children }: { children: ReactNode }) {
  const [askOpen, setAskOpen] = useState(false)
  const closeAsk = useCallback(() => setAskOpen(false), [])
  return (
    <div className="min-h-screen bg-bg">
      <TopBar askOpen={askOpen} onAsk={() => setAskOpen((o) => !o)} />
      <div className="flex">
        <LeftRail />
        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
      <AskPanel open={askOpen} onClose={closeAsk} />
      <SourceDrawer />
    </div>
  )
}

export function NotFound() {
  return (
    <section className="mx-auto mt-16 max-w-md rounded-card border border-border bg-surface p-8 text-center">
      <Construction size={24} aria-hidden="true" className="mx-auto text-ink-2" />
      <h1 className="mt-3 text-[20px] font-semibold">Page not found</h1>
      <p className="mt-1 text-ink-2">Pick a step on the left.</p>
    </section>
  )
}

export function NotBuilt({ title, phase }: { title: string; phase: string }) {
  return (
    <section className="mx-auto mt-16 max-w-md rounded-card border border-border bg-surface p-8 text-center">
      <Construction size={24} aria-hidden="true" className="mx-auto text-ink-2" />
      <h1 className="mt-3 text-[20px] font-semibold">{title}</h1>
      <p className="mt-1 text-ink-2">Built in Phase {phase}.</p>
    </section>
  )
}
