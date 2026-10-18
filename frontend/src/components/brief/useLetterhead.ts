import { useState } from 'react'
import { loadLetterhead, saveLetterhead, type Letterhead } from '../../lib/letterhead'

/** Letterhead settings, saved to this browser on every change. `persisted` is false when storage refused. */
export function useLetterhead() {
  const [settings, setSettings] = useState<Letterhead>(loadLetterhead)
  const [persisted, setPersisted] = useState(true)
  const update = (patch: Partial<Letterhead>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    setPersisted(saveLetterhead(next))
  }
  return { settings, update, persisted }
}
