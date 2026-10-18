import type { SourceEntry } from '../../lib/briefSources'

/** The printed "Sources" appendix: each reference number with its location, file and quote. No internal ids. */
export function SourcesAppendix({ entries }: { entries: SourceEntry[] }) {
  return (
    <section aria-labelledby="brief-sources" className="print-only brief-section doc-appendix">
      <h2 id="brief-sources" className="doc-h2 mb-2 text-[16px] font-semibold">
        Sources
      </h2>
      {entries.length === 0 ? (
        <p className="text-[12px] text-ink-2">No sources are cited.</p>
      ) : (
        <ol className="doc-sources list-none p-0">
          {entries.map((e) => (
            <li key={e.n} data-ref={e.n}>
              <span className="doc-src-n">{e.n}</span>
              <span className="doc-src-body">
                <span className="doc-src-where">{e.location}</span>
                {e.fileName && <span className="doc-src-file"> · {e.fileName}</span>}
                {e.quote && (
                  <span className="doc-src-quote">
                    “{e.quote}”{e.quoteChecked === false && <span className="doc-src-unchecked"> (quote not checked by code)</span>}
                  </span>
                )}
                {e.supports.length > 0 && <span className="doc-src-for">For: {e.supports.join(', ')}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
