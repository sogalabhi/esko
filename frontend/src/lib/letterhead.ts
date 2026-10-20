import type { Fact } from '../types/project'
import { formatValue, titleCase } from './labels'

/** Letterhead for the printed brief. Kept in this browser only (key `bf.letterhead`). */
export interface Letterhead {
  company: string
  /** data:image/... URL, or null. */
  logo: string | null
  /** #rrggbb */
  accent: string
  preparedFor: string
  preparedBy: string
  reference: string
  footer: string
}

export const LETTERHEAD_KEY = 'bf.letterhead'
export const APPROVER_KEY = 'bf.approver'
/** The app accent token (--accent in index.css / UI.md §3). */
export const DEFAULT_ACCENT = '#2f7d32'
export const DEFAULT_FOOTER = 'Confidential · for the design agency'
export const LOGO_MAX_BYTES = 1024 * 1024
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml']

const HEX = /^#[0-9a-f]{6}$/i

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function readApprover(): string {
  try {
    return storage()?.getItem(APPROVER_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveApprover(name: string) {
  try {
    storage()?.setItem(APPROVER_KEY, name)
  } catch {
    /* storage unavailable: the name is kept for this visit only */
  }
}

export function defaultLetterhead(): Letterhead {
  return {
    company: '',
    logo: null,
    accent: DEFAULT_ACCENT,
    preparedFor: '',
    preparedBy: readApprover(),
    reference: '',
    footer: DEFAULT_FOOTER,
  }
}

/** Saved settings merged over the defaults; anything missing, corrupt or blocked falls back to the default. */
export function loadLetterhead(): Letterhead {
  const base = defaultLetterhead()
  let raw: string | null = null
  try {
    raw = storage()?.getItem(LETTERHEAD_KEY) ?? null
  } catch {
    return base
  }
  if (!raw) return base
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return base
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return base
  const d = data as Record<string, unknown>
  const str = (k: keyof Letterhead): string => (typeof d[k] === 'string' ? (d[k] as string) : (base[k] as string))
  return {
    company: str('company'),
    logo: typeof d.logo === 'string' && d.logo.startsWith('data:image/') ? d.logo : null,
    accent: typeof d.accent === 'string' && HEX.test(d.accent) ? d.accent.toLowerCase() : base.accent,
    preparedFor: str('preparedFor'),
    preparedBy: str('preparedBy'),
    reference: str('reference'),
    footer: str('footer'),
  }
}

/** True when saved; false when the browser refused (blocked or full): the settings then last for this visit. */
export function saveLetterhead(l: Letterhead): boolean {
  try {
    const s = storage()
    if (!s) return false
    s.setItem(LETTERHEAD_KEY, JSON.stringify(l))
    return true
  } catch {
    return false
  }
}

/** Why a logo file is refused, or null when it is fine. */
export function logoProblem(file: { type: string; size: number; name?: string }): string | null {
  if (!LOGO_TYPES.includes(file.type)) return 'The logo must be a PNG, JPG or SVG image.'
  if (file.size > LOGO_MAX_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1)
    return `The logo is ${mb} MB. Use an image of 1 MB or less.`
  }
  return null
}

export function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => (typeof r.result === 'string' ? resolve(r.result) : reject(new Error('The file could not be read.')))
    r.onerror = () => reject(new Error('The file could not be read.'))
    r.readAsDataURL(file)
  })
}

function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastOnWhite(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05)
}

/** The accent, darkened just enough to reach 4.5:1 on white so headings stay readable. */
export function readableAccent(hex: string): string {
  if (!HEX.test(hex)) return DEFAULT_ACCENT
  let [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  let out = hex.toLowerCase()
  for (let i = 0; i < 40 && contrastOnWhite(out) < 4.5; i++) {
    ;[r, g, b] = [r, g, b].map((c) => Math.floor(c * 0.92))
    out = `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`
  }
  return out
}

/** §9 has no product block; derived from the identity and net quantity facts, as the top bar does. */
export function productParts(facts: Fact[]): { name: string; quantity: string } {
  const identity = facts.find((f) => f.field === 'Statement of identity')
  const net = facts.find((f) => f.field === 'Net quantity')
  return { name: identity?.value ? titleCase(identity.value) : 'Untitled product', quantity: net ? formatValue(net) : '' }
}

/** "Design brief – Granola — Berry Crunch – v3": the name the browser offers for Save as PDF. */
export function printTitle(product: string, version: number): string {
  return `Design brief – ${product} – v${version}`
}

/** "United States" for "US"; the code itself when the browser has no name for it. */
export function marketName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}

/** A string safe inside a CSS `content: "..."` value. */
export function cssString(s: string): string {
  return `"${s.replace(/[\\"]/g, '\\$&').replace(/[\r\n]+/g, ' ').replace(/</g, '\\3c ')}"`
}
