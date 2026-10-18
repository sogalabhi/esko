import { CircleAlert, ImageUp, Trash2, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import { LOGO_TYPES, logoProblem, readableAccent, readAsDataUrl, type Letterhead } from '../../lib/letterhead'

const field =
  'w-full rounded-chip border border-border bg-surface px-2 py-1 text-[13px] focus-visible:outline-2 focus-visible:outline-info'
const btn =
  'inline-flex items-center gap-1.5 rounded-chip border border-border bg-surface px-2.5 py-1 text-[13px] font-medium hover:border-ink-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-info'

interface Props {
  settings: Letterhead
  onChange: (patch: Partial<Letterhead>) => void
  onClose: () => void
  /** False when the browser refused to save: the settings last for this visit only. */
  persisted?: boolean
}

type TextKey = 'company' | 'preparedFor' | 'preparedBy' | 'reference' | 'footer'
const TEXT_FIELDS: { key: TextKey; label: string; hint?: string }[] = [
  { key: 'company', label: 'Company name' },
  { key: 'reference', label: 'Reference / project code' },
  { key: 'preparedFor', label: 'Prepared for', hint: 'The agency' },
  { key: 'preparedBy', label: 'Prepared by' },
  { key: 'footer', label: 'Footer note' },
]

/** Letterhead settings for the printed brief. A small panel, not printed. */
export function LetterheadSettings({ settings, onChange, onClose, persisted = true }: Props) {
  const id = useId()
  const [logoError, setLogoError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const first = useRef<HTMLInputElement>(null)

  useEffect(() => {
    first.current?.focus()
  }, [])

  const pickLogo = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const problem = logoProblem(file)
    if (problem) {
      setLogoError(problem)
      return
    }
    try {
      onChange({ logo: await readAsDataUrl(file) })
      setLogoError(null)
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : 'The file could not be read.')
    }
  }

  const darker = readableAccent(settings.accent) !== settings.accent.toLowerCase()

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="no-print mb-3 rounded-card border border-border bg-surface p-4"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id={`${id}-title`} className="text-[16px] font-semibold">
            Letterhead
          </h2>
          <p className="text-[12px] text-ink-2">Used on the printed brief and Save as PDF. Kept in this browser.</p>
        </div>
        <button type="button" onClick={onClose} className={btn} aria-label="Close letterhead settings">
          <X size={14} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {TEXT_FIELDS.map((f, i) => (
          <div key={f.key}>
            <label htmlFor={`${id}-${f.key}`} className="block text-[12px] font-medium text-ink-2">
              {f.label}
            </label>
            <input
              id={`${id}-${f.key}`}
              ref={i === 0 ? first : undefined}
              type="text"
              value={settings[f.key]}
              placeholder={f.hint}
              onChange={(e) => onChange({ [f.key]: e.target.value })}
              className={`mt-0.5 ${field}`}
            />
          </div>
        ))}

        <div>
          <label htmlFor={`${id}-accent`} className="block text-[12px] font-medium text-ink-2">
            Accent colour
          </label>
          <div className="mt-0.5 flex items-center gap-2">
            <input
              id={`${id}-accent`}
              type="color"
              value={settings.accent}
              onChange={(e) => onChange({ accent: e.target.value })}
              className="h-8 w-10 cursor-pointer rounded-chip border border-border bg-surface p-0.5 focus-visible:outline-2 focus-visible:outline-info"
            />
            <span className="font-mono text-[12px]">{settings.accent}</span>
          </div>
          {darker && <p className="mt-0.5 text-[12px] text-ink-2">Headings use a darker shade so text stays readable.</p>}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor={`${id}-logo`} className="block text-[12px] font-medium text-ink-2">
            Logo (PNG, JPG or SVG, up to 1 MB)
          </label>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {settings.logo && (
              <img
                src={settings.logo}
                alt={`Logo preview${settings.company ? ` for ${settings.company}` : ''}`}
                className="h-10 max-w-[160px] rounded-[4px] border border-border object-contain p-1"
              />
            )}
            <input
              id={`${id}-logo`}
              ref={fileInput}
              type="file"
              accept={LOGO_TYPES.join(',')}
              onChange={(e) => void pickLogo(e)}
              aria-describedby={logoError ? `${id}-logo-error` : undefined}
              tabIndex={-1}
              className="sr-only"
            />
            <button type="button" className={btn} onClick={() => fileInput.current?.click()}>
              <ImageUp size={14} aria-hidden="true" />
              {settings.logo ? 'Replace logo' : 'Upload logo'}
            </button>
            {settings.logo && (
              <button type="button" className={btn} onClick={() => onChange({ logo: null })}>
                <Trash2 size={14} aria-hidden="true" />
                Remove logo
              </button>
            )}
          </div>
          {logoError && (
            <p id={`${id}-logo-error`} role="alert" className="mt-1 flex items-start gap-1.5 text-[13px] text-bad">
              <CircleAlert size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
              {logoError}
            </p>
          )}
        </div>
      </div>

      {!persisted && (
        <p role="status" className="mt-3 flex items-start gap-1.5 text-[12px] text-ink-2">
          <CircleAlert size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-warn" />
          This browser did not save the settings; they last for this visit only.
        </p>
      )}
    </section>
  )
}
