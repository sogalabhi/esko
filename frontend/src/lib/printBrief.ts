/**
 * The print brief for the demo product: how to print the approved (v3) artwork, what must print exactly as
 * approved, and who released it. The label copy itself is in the artwork file and is not repeated. Hard-coded for now: there is no corrected v3 artwork file yet, so these values are illustrative and the
 * brief says so. The print specification lines marked `fromFile` were read from the artwork PDF.
 */

export const COMPANY = {
  name: 'Esko',
  unit: 'Packaging artwork release',
  line: 'Artwork management and print release',
}

export interface BriefRow {
  label: string
  value: string
  note?: string
  fromFile?: boolean
}

export const BRIEF = {
  number: 'PB-DF-BERRY-480G-US-v3',
  version: 'v3',
  approvedOn: '27 Oct 2026',
  illustrative: 'Illustrative: the corrected v3 artwork is staged; the release details below are the approved target, not read from a v3 file.',
  job: [
    { label: 'Product', value: 'Dancing Fish Granola, Berry Crunch, 480 g' },
    { label: 'Label ID', value: 'DF-GRAN-BERRY-US-001' },
    { label: 'BPN', value: 'DF-BERRY-480G-US' },
    { label: 'Market', value: 'United States (FDA labelling)' },
    { label: 'Pack', value: 'Folding carton with tuck top' },
    { label: 'Artwork file', value: 'DancingFish_Granola_Berry_US_Carton.pdf, version v3' },
  ] as BriefRow[],
  approvals: [
    { by: 'A. Rao', role: 'Regulatory Affairs', what: 'Labelling and claims', at: '27 Oct 2026, 09:40' },
    { by: 'M. Iyer', role: 'Brand Manager', what: 'Copy, claims and brand assets', at: '27 Oct 2026, 11:05' },
    { by: 'S. Khan', role: 'Print Production', what: 'Approved for print', at: '27 Oct 2026, 15:20' },
  ],
  // Where the regulated items sit and how they must print. Their wording is in the artwork file, not repeated here.
  critical: [
    { label: 'Nutrition Facts panel', value: 'Left side panel. Do not move, rescale or re-set.' },
    { label: 'Net quantity', value: 'Bottom 30% of the front panel. Do not move.' },
    { label: 'Ingredients and allergens', value: 'Back panel. Do not re-set or reflow.' },
    { label: 'Barcode', value: 'UPC-A on the back panel, 100% size (37.3 × 25.9 mm), black on white, quiet zones clear. Verify grade C or better on press.' },
    { label: 'Smallest text', value: '6.5 pt (storage instructions). Company minimum 6 pt: do not reduce.' },
    { label: 'Glue areas', value: 'Ink-free and coating-free.' },
  ] as BriefRow[],
  changes: 'v3 replaces v1: corrected nutrition values, ingredients and allergen statement; net weight in ounces added; manufacturer address and consumer care line added; “No added sugar”, “GMO free”, vegan wording and the Certified Vegan mark removed; EU elements and the hidden EU table deleted; front photo replaced at higher resolution. Print only from v3.',
  order: [
    { label: 'Quantity', value: '50,000 cartons' },
    { label: 'Proof due', value: '3 Nov 2026' },
    { label: 'Delivery', value: 'By 14 Nov 2026 to Dancing Fish Granola Co., Portland, OR' },
    { label: 'Contact', value: 'S. Khan, Print Production' },
  ] as BriefRow[],
  print: [
    { label: 'Printing process', value: 'Sheetfed offset' },
    { label: 'Substrate', value: 'Folding boxboard (SBS), 350 g/m²' },
    { label: 'Process inks', value: 'Cyan, Magenta, Yellow, Black', fromFile: true },
    { label: 'Spot inks', value: 'PANTONE 268 C, Silver metallic ink', fromFile: true },
    { label: 'Finish', value: 'Coating (overall), glue areas kept ink-free and coating-free', fromFile: true },
    { label: 'Not printed', value: 'Cut, Crease, Glue, Bleed, Dimensions and text, Artwork panel, Ink-free artwork panel (dieline layers)', fromFile: true },
    { label: 'Flat size', value: '455.9 × 381.5 mm, 11 panels', fromFile: true },
    { label: 'Bleed', value: '3 mm beyond the cut line' },
    { label: 'Output intent', value: 'CMYK', fromFile: true },
    { label: 'File format', value: 'PDF/X-4 (v3 export)' },
    { label: 'Fonts', value: '9 fonts, all embedded', fromFile: true },
    { label: 'Images', value: 'Above 300 ppi at placed size (v3 replaced the 112 ppi front photo)' },
    { label: 'Smallest text', value: '6.5 pt (storage), company minimum 6 pt' },
    { label: 'Colour proof', value: 'Contract proof to the output intent; PANTONE 268 C to the brand standard' },
  ] as BriefRow[],
}
