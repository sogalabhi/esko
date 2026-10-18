import { PackageOpen, Upload } from 'lucide-react'
import { Link } from 'react-router'

/**
 * New-product mode (PLAN "Two modes"): no old pack among the inputs. Screens that draw on the pack say so
 * and never fall back to sample data.
 */
export function NoPackState() {
  return (
    <section aria-labelledby="no-pack-title" className="mx-auto mt-16 max-w-md rounded-card border border-border bg-surface p-8 text-center">
      <PackageOpen size={24} aria-hidden="true" className="mx-auto text-ink-2" />
      <h1 id="no-pack-title" className="mt-3 text-[20px] font-semibold">
        No current pack
      </h1>
      <p className="mt-1 text-ink-2">Upload the old pack (dieline PDF or a photo) to see what changes on it. The brief works without it.</p>
      <Link
        to="/evidence"
        className="mt-4 inline-flex items-center gap-1.5 rounded-chip border border-border bg-surface px-3 py-1.5 text-[13px] font-medium text-ink hover:border-ink-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-info"
      >
        <Upload size={15} aria-hidden="true" />
        Upload the old pack
      </Link>
    </section>
  )
}
