import { useEffect, useState } from 'react'

type Health = { status: string; ai: { provider: string; model: string; keySet: boolean } }
type State = { kind: 'loading' } | { kind: 'ok'; health: Health } | { kind: 'down' }

export default function App() {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    fetch('/api/health')
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json() as Promise<Health>
      })
      .then((health) => !cancelled && setState({ kind: 'ok', health }))
      .catch(() => !cancelled && setState({ kind: 'down' }))
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-[28px] font-semibold">BriefForge</h1>
      <p className="mt-1 text-ink-2">Packaging files in, a proven design brief out.</p>
      <section className="mt-8 rounded-card border border-border bg-surface p-6">
        {state.kind === 'loading' && <p className="text-ink-2">Checking backend</p>}
        {state.kind === 'ok' && (
          <>
            <p className="flex items-center gap-2 font-medium text-ok">
              <span className="inline-block h-2 w-2 rounded-full bg-ok" />
              Backend OK
            </p>
            <p className="mt-2 font-mono text-[12px] text-ink-2">
              {state.health.ai.provider} / {state.health.ai.model}
              {state.health.ai.keySet ? '' : ' (no key set)'}
            </p>
          </>
        )}
        {state.kind === 'down' && (
          <p className="flex items-center gap-2 font-medium text-bad">
            <span className="inline-block h-2 w-2 rounded-full bg-bad" />
            Backend unreachable
          </p>
        )}
      </section>
    </main>
  )
}
