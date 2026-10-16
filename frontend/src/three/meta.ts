import { CircleCheck, CircleDashed, Info, ShieldCheck, TriangleAlert, CircleX, type LucideIcon } from 'lucide-react'
import type { PinSeverity } from './types'

/** Token hex values from UI.md §3 (WebGL materials cannot read CSS variables). */
export const TOKEN_HEX = {
  ink: '#16181d',
  ink2: '#5b6170',
  border: '#e4e4de',
  surface: '#ffffff',
  bg: '#fafaf7',
  ok: '#1f7a4d',
  warn: '#b45309',
  bad: '#b42318',
  info: '#1d4ed8',
  /** Unprinted inside of the board. */
  board: '#e9e6dd',
} as const

export interface SeverityMeta {
  word: string
  Icon: LucideIcon
  hex: string
  /** Tailwind classes for the DOM pin (text colour on a tint). */
  cls: string
}

/** Every pin carries an icon and a word; colour is never the only signal. */
export const SEVERITY_META: Record<PinSeverity, SeverityMeta> = {
  high: { word: 'Problem', Icon: CircleX, hex: TOKEN_HEX.bad, cls: 'text-bad border-bad' },
  medium: { word: 'Check', Icon: TriangleAlert, hex: TOKEN_HEX.warn, cls: 'text-warn border-warn' },
  low: { word: 'Note', Icon: Info, hex: TOKEN_HEX.info, cls: 'text-info border-info' },
  pass: { word: 'Pass', Icon: CircleCheck, hex: TOKEN_HEX.ok, cls: 'text-ok border-ok' },
}

export const REGULATED_META = { word: 'Regulated', Icon: ShieldCheck, hex: TOKEN_HEX.info }
export const MISSING_META = { word: 'Missing', Icon: CircleDashed, hex: TOKEN_HEX.warn }
