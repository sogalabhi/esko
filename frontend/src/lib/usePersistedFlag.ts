import { useCallback, useState } from 'react'

/** A boolean UI preference remembered in localStorage; storage may be unavailable, so every access is guarded. */
export function usePersistedFlag(key: string, initial = false): [boolean, () => void] {
  const [value, setValue] = useState<boolean>(() => {
    try {
      const v = window.localStorage.getItem(key)
      return v == null ? initial : v === '1'
    } catch {
      return initial
    }
  })
  const toggle = useCallback(() => {
    setValue((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(key, next ? '1' : '0')
      } catch {
        /* storage unavailable: keep in memory only */
      }
      return next
    })
  }, [key])
  return [value, toggle]
}
