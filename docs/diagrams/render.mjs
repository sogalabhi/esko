// Render SVG files to PNG at 3840x2160 (a 1920x1080 viewport at device scale 2).
// Usage: node docs/diagrams/render.mjs in.svg out.png [in2.svg out2.png ...]
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const { chromium } = await import(pathToFileURL(resolve(here, '../../node_modules/playwright/index.mjs')).href)

const args = process.argv.slice(2)
if (args.length < 2 || args.length % 2) {
  console.error('usage: render.mjs in.svg out.png [...]')
  process.exit(2)
}
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 })
for (let i = 0; i < args.length; i += 2) {
  const svg = readFileSync(args[i], 'utf8')
  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#faf7f2}svg{display:block}</style></head><body>${svg}</body></html>`,
  )
  await page.evaluate(() => document.fonts.ready)
  // embedded faces must have loaded; Inter comes from the system
  const missing = await page.evaluate(() => {
    const loaded = new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')))
    const out = ['Instrument Serif', 'JetBrains Mono'].filter((f) => !loaded.has(f))
    if (!document.fonts.check('16px Inter')) out.push('Inter')
    return out
  })
  if (missing.length) console.warn(`fonts not available: ${missing.join(', ')}`)
  await page.screenshot({ path: args[i + 1], clip: { x: 0, y: 0, width: 1920, height: 1080 } })
  console.log(`wrote ${args[i + 1]}`)
}
await browser.close()
