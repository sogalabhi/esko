import { Construction } from 'lucide-react'
import type { ReactNode } from 'react'
import { LeftRail } from './LeftRail'
import { SourceDrawer } from './SourceDrawer'
import { TopBar } from './TopBar'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg">
      <TopBar />
      <div className="flex">
        <LeftRail />
        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
      <SourceDrawer />
    </div>
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
