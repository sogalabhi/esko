/**
 * Print rules for the A3 poster. Injected by <Poster> (so they only exist while the Markup screen is open):
 * hidden on screen; while <body> has `bf-printing` the poster is the only thing printed, on one A3 landscape page.
 */
export const POSTER_CSS = `
.bf-poster { display: none; }
@page poster { size: A3 landscape; margin: 10mm; }
@media print {
  body.bf-printing { background: #fff; }
  body.bf-printing > *:not(.bf-poster) { display: none !important; }
  body.bf-printing .bf-poster {
    display: grid !important;
    page: poster;
    width: 400mm;
    height: 277mm;
    overflow: hidden;
    break-inside: avoid;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
}
`
