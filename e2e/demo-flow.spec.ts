import { expect, test } from '@playwright/test'
import path from 'node:path'

const SAMPLES = path.resolve(__dirname, '..', 'samples')
const FILES = [
  path.join(SAMPLES, 'DancingFish_Granola_Berry_US_Carton.pdf'),
  path.join(SAMPLES, 'DancingFish_Granola_BerryCrunch_US_Content_Sheet.xlsx'),
]

test('Phase 4 demo flow: upload, conflicts, source drawer, answer a question', async ({ page }) => {
  // Evidence: upload both samples
  await page.goto('/evidence')
  await page.getByLabel(/Drop your packaging files/).setInputFiles(FILES)
  await expect(page.getByText('Analysis finished')).toBeVisible({ timeout: 60_000 })
  const counter = page.getByTestId('evidence-counter')
  await expect(counter).toContainText(/[1-9]\d* conflicts?/)
  await expect(counter).toContainText(/[1-9]\d* facts?/)

  // Facts: honey conflict
  await page.getByRole('link', { name: 'Facts' }).first().click()
  await expect(page.getByRole('heading', { name: 'Facts', level: 1 })).toBeVisible()

  // The honey conflict: 9% on the content sheet vs 1% on the carton
  const sheetRow = page.getByRole('row', { name: /^Honey % 9%/ })
  const cartonRow = page.getByRole('row', { name: /^Honey % 1%/ })
  await expect(sheetRow).toContainText('Conflict')
  await expect(cartonRow).toContainText('Conflict')

  const drawer = page.getByRole('dialog', { name: 'Source' })
  await sheetRow.getByRole('button', { name: 'Sheet · B26' }).click()
  await expect(drawer.getByRole('heading', { level: 2 })).toHaveText('Content sheet · B26')
  await expect(drawer).toContainText('Quote checked by code')
  await drawer.getByRole('button', { name: 'Close source' }).click()
  await expect(drawer).toBeHidden()

  await cartonRow.getByRole('button', { name: /^Carton/ }).click()
  await expect(drawer.getByRole('heading', { level: 2 })).toHaveText(/Carton.*panel/)
  await expect(drawer).toContainText('Quote checked by code')
  await drawer.getByRole('button', { name: 'Close source' }).click()
  await expect(drawer).toBeHidden()

  // Questions: answer the top one
  const nav = page.getByRole('navigation', { name: 'Steps' })
  const openBefore = Number(/Questions\s*(\d+)/.exec((await nav.getByRole('link', { name: /Questions/ }).innerText()) ?? '')?.[1])
  expect(openBefore).toBeGreaterThan(0)
  await nav.getByRole('link', { name: /Questions/ }).click()
  await expect(page.getByRole('heading', { name: 'Questions', level: 1 })).toBeVisible()
  const top = page.getByRole('article').first()
  const topTitle = (await top.getByRole('heading', { level: 3 }).innerText()).trim()
  await top.getByRole('listitem').first().getByRole('button').click()

  // The answered question leaves the open list, and the step counter drops
  await expect(page.getByRole('heading', { level: 3, name: topTitle, exact: true })).toHaveCount(0)
  await expect(nav.getByRole('link', { name: /Questions/ })).not.toContainText(new RegExp(String.raw`Questions\s*${openBefore}`))

  // Facts reflect the new state and still load
  await nav.getByRole('link', { name: /Facts/ }).click()
  await expect(page.getByRole('heading', { name: 'Facts', level: 1 })).toBeVisible()
})
