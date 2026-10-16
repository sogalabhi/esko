import { FlaskConical, LoaderCircle } from 'lucide-react'
import { useCallback, useEffect, useId, useState } from 'react'
import { demoApi } from '../api/demo'
import { useProject } from '../state/project'
import { Toast } from './Toast'

type Availability = { status: 'checking' } | { status: 'ready' } | { status: 'unavailable'; reason: string }

const LOADED_EVENT = 'briefforge:demo-loaded'

/** The "Demo data loaded" toast. The button that was clicked may unmount once the project loads (empty state), so any button announces and one host shows it. */
export function DemoLoadedToast() {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const on = () => setShown(true)
    window.addEventListener(LOADED_EVENT, on)
    return () => window.removeEventListener(LOADED_EVENT, on)
  }, [])
  const dismiss = useCallback(() => setShown(false), [])
  return shown ? <Toast message="Demo data loaded" onDismiss={dismiss} timeoutMs={4000} /> : null
}

const base =
  'inline-flex items-center gap-1.5 rounded-chip px-3 py-2 text-[14px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info disabled:cursor-not-allowed disabled:opacity-60'
const STYLE = {
  primary: `${base} bg-accent font-semibold text-white hover:bg-accent/90`,
  secondary: `${base} border border-border bg-surface hover:border-ink-2`,
}

/**
 * Restores the saved demo project (no AI calls) and refreshes the store.
 * Disabled, with the reason on screen, while the backend says there is no snapshot.
 */
export function LoadDemoButton({
  label = 'Load demo: Dancing Fish Berry Crunch',
  variant = 'secondary',
  toast = true,
}: {
  label?: string
  variant?: 'primary' | 'secondary'
  /** Host the "Demo data loaded" toast here. Pass false when another <DemoLoadedToast /> is always mounted. */
  toast?: boolean
}) {
  const { source, reload } = useProject()
  const [avail, setAvail] = useState<Availability>(
    source === 'api' ? { status: 'checking' } : { status: 'unavailable', reason: 'Demo data needs the backend (this is the mock preview).' },
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const reasonId = useId()

  useEffect(() => {
    if (source !== 'api') return
    let live = true
    demoApi
      .status()
      .then((s) => {
        if (live) setAvail(s.available ? { status: 'ready' } : { status: 'unavailable', reason: 'No demo snapshot has been saved yet. Run backend/scripts/make_demo.py.' })
      })
      .catch((e: unknown) => {
        if (live) setAvail({ status: 'unavailable', reason: e instanceof Error ? e.message : 'Could not check for demo data.' })
      })
    return () => {
      live = false
    }
  }, [source])

  const onClick = async () => {
    setBusy(true)
    setError('')
    try {
      await demoApi.load()
      await reload()
      window.dispatchEvent(new Event(LOADED_EVENT))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The demo data could not be loaded.')
    } finally {
      setBusy(false)
    }
  }

  const disabled = busy || avail.status !== 'ready'
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" onClick={() => void onClick()} disabled={disabled} aria-describedby={avail.status === 'unavailable' ? reasonId : undefined} className={STYLE[variant]}>
        {busy ? <LoaderCircle size={16} aria-hidden="true" className="motion-safe:animate-spin" /> : <FlaskConical size={16} aria-hidden="true" />}
        {label}
      </button>
      {avail.status === 'unavailable' && (
        <span id={reasonId} className="text-[12px] text-ink-2">
          {avail.reason}
        </span>
      )}
      {error && (
        <span role="alert" className="text-[12px] text-bad">
          {error}
        </span>
      )}
      {toast && <DemoLoadedToast />}
    </span>
  )
}
