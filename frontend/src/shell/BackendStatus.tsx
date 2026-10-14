import { useEffect, useState } from 'react'

type Health = { status: string; ai: { provider: string; model: string; keySet: boolean } }
type State = { kind: 'loading' } | { kind: 'ok'; health: Health } | { kind: 'down' }

/** Small status dot for the backend health check (GET /api/health). */
export function BackendStatus() {
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

  const title =
    state.kind === 'ok'
      ? `${state.health.ai.provider} / ${state.health.ai.model}${state.health.ai.keySet ? '' : ' (no key set)'}`
      : undefined
  const [dot, text, word] =
    state.kind === 'ok'
      ? ['bg-ok', 'text-ok', 'Backend OK']
      : state.kind === 'down'
        ? ['bg-bad', 'text-bad', 'Backend unreachable']
        : ['bg-ink-2', 'text-ink-2', 'Checking backend']

  return (
    <span role="status" title={title} className={`flex items-center gap-1.5 text-[12px] font-medium ${text}`}>
      <span className={`inline-block h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
      <span className="hidden xl:inline">{word}</span>
      <span className="sr-only xl:hidden">{word}</span>
      {title && <span className="sr-only">{title}</span>}
    </span>
  )
}
