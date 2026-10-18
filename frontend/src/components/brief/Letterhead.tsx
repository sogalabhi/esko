import { BadgeCheck, FilePen } from 'lucide-react'
import { cssString, type Letterhead as LetterheadSettings } from '../../lib/letterhead'

export interface DocMeta {
  product: string
  quantity: string
  version: number
  market: string
  /** "18 October 2026" */
  date: string
  approvedBy?: string
  /** "17 Oct 2026, 14:05" */
  approvedAt?: string
}

/**
 * The printed first-page header: logo and company (only when set), "Design brief", the product and a
 * meta row, then a thin accent rule. Print-only; the brief's print preview shows it on screen.
 */
export function Letterhead({ settings, meta }: { settings: LetterheadSettings; meta: DocMeta }) {
  const company = settings.company.trim()
  const rows: [string, string][] = [
    ['Reference', settings.reference.trim()],
    ['Version', `v${meta.version}`],
    ['Market', meta.market],
    ['Date', meta.date],
    ['Prepared for', settings.preparedFor.trim()],
    ['Prepared by', settings.preparedBy.trim()],
  ]
  return (
    <div data-testid="letterhead" className="print-only doc-letterhead">
      {(settings.logo || company) && (
        <div className="doc-brand">
          {settings.logo && <img src={settings.logo} alt={company || 'Company logo'} className="doc-logo" />}
          {company && <p className="doc-company">{company}</p>}
        </div>
      )}
      <p className="doc-kind">Design brief</p>
      <p className="doc-product">
        {meta.product}
        {meta.quantity && <span className="doc-qty"> · {meta.quantity}</span>}
      </p>
      <dl className="doc-meta">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        <div>
          <dt>Status</dt>
          <dd data-testid="doc-status" className={meta.approvedBy ? 'doc-status-ok' : 'doc-status-draft'}>
            {meta.approvedBy ? (
              <>
                <BadgeCheck size={12} aria-hidden="true" className="doc-status-icon" />
                Approved by {meta.approvedBy}
                {meta.approvedAt ? ` · ${meta.approvedAt}` : ''}
              </>
            ) : (
              <>
                <FilePen size={12} aria-hidden="true" className="doc-status-icon" />
                Draft
              </>
            )}
          </dd>
        </div>
      </dl>
      <hr className="doc-rule" />
    </div>
  )
}

/** Faint diagonal "DRAFT · NOT APPROVED" repeated on every printed page; rendered only while unapproved. */
export function DraftWatermark() {
  return (
    <div data-testid="draft-watermark" aria-hidden="true" className="print-only doc-watermark">
      <span>DRAFT · NOT APPROVED</span>
    </div>
  )
}

/** End-of-document line: the footer note and version, so they survive where @page margin boxes are not supported. */
export function Colophon({ settings, version }: { settings: LetterheadSettings; version: number }) {
  const parts = [settings.footer.trim(), `Design brief v${version}`, settings.reference.trim()].filter(Boolean)
  return <p className="print-only doc-colophon">{parts.join(' · ')}</p>
}

/** Running footer on every printed page: note and version left, "Page X of Y" right (CSS @page margin boxes). */
export function PrintPageRules({ settings, version }: { settings: LetterheadSettings; version: number }) {
  const left = [settings.footer.trim(), `v${version}`].filter(Boolean).join(' · ')
  const box = "font-family: 'IBM Plex Sans', system-ui, sans-serif; font-size: 8pt; color: #5b6170;"
  const css = `@media print {
  @page {
    @bottom-left { content: ${cssString(left)}; ${box} }
    @bottom-right { content: "Page " counter(page) " of " counter(pages); ${box} }
  }
}`
  return <style data-testid="print-page-rules">{css}</style>
}
