import { expect, test } from '@playwright/test'
import path from 'node:path'

const SAMPLES = path.resolve(__dirname, '..', 'samples')
const FILES = [
  path.join(SAMPLES, 'DancingFish_Granola_Berry_US_Carton.pdf'),
  path.join(SAMPLES, 'DancingFish_Granola_BerryCrunch_US_Content_Sheet.xlsx'),
]

test('P2 demo flow: upload, what we read, source drawer, checks verdict', async ({ page }) => {
  // Evidence: upload both samples
  await page.goto('/evidence')
  await page.getByLabel(/Drop your packaging files/).setInputFiles(FILES)
  await expect(page.getByText('Analysis finished')).toBeVisible({ timeout: 60_000 })
  const counter = page.getByTestId('evidence-counter')
  await expect(counter).toContainText(/[1-9]\d* conflicts?/)
  await expect(counter).toContainText(/[1-9]\d* facts?/)

  // What we read: honey conflict
  const nav = page.getByRole('navigation', { name: 'Steps' })
  await nav.getByRole('link', { name: /What we read/ }).click()
  await expect(page.getByRole('heading', { name: 'What we read', level: 1 })).toBeVisible()

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

  // Checks: the artwork is not ready, and the honey mismatch is a Fail with its rule and both sources
  await nav.getByRole('link', { name: /Checks/ }).click()
  await expect(page.getByRole('heading', { name: 'Checks', level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: /Print verdict: not ready to print/ })).toBeVisible()
  const honey = page.getByRole('article').filter({ hasText: /honey/i }).first()
  await expect(honey).toContainText(/fail/i)
  await expect(honey).toContainText('Quote checked by code')

  // What we read still loads
  await nav.getByRole('link', { name: /What we read/ }).click()
  await expect(page.getByRole('heading', { name: 'What we read', level: 1 })).toBeVisible()
})
