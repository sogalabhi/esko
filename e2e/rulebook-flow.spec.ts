import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'

const RULEBOOK = path.resolve(__dirname, '..', 'rulebooks', 'Dancing_Fish_US_Label_Rulebook.docx')
const nav = (page: Page) => page.getByRole('navigation', { name: 'Steps' })

async function loadDemo(page: Page) {
  await page.goto('/evidence')
  await page.getByRole('button', { name: /^Load demo/ }).first().click()
  await expect(page.getByTestId('evidence-counter')).toContainText(/[1-9]\d* facts?/)
}

async function addRulebook(page: Page) {
  await nav(page).getByRole('link', { name: /Rules/ }).click()
  await expect(page.getByRole('heading', { name: 'Rules', level: 1 })).toBeVisible()
  await page.getByLabel('Rulebook file').setInputFiles(RULEBOOK)
  await expect(page.getByRole('status').filter({ hasText: /Rulebook added/ })).toContainText('21 rules read', { timeout: 60_000 })
}

async function openChecks(page: Page) {
  await nav(page).getByRole('link', { name: /Checks/ }).click()
  await expect(page.getByRole('heading', { name: 'Checks', level: 1 })).toBeVisible()
}

test.describe('rulebook, checks, decisions, ask, markup, report', () => {
  test.beforeEach(async ({ page }) => {
    await loadDemo(page)
    await addRulebook(page)
  })

  test('Rules: 21 rules, DF-21 proposed, a rule links to its finding on Checks', async ({ page }) => {
    await expect(page.locator('[data-rulebook-rule]')).toHaveCount(21)
    const df21 = page.locator('[data-rulebook-rule="DF-21"]')
    await expect(df21).toContainText('Proposed — not applied')

    const df16 = page.locator('[data-rulebook-rule="DF-16"]')
    const link = df16.getByRole('list', { name: 'Findings from this rule' }).getByRole('link').first()
    const title = (await link.textContent()) ?? ''
    await link.click()
    await expect(page).toHaveURL(/\/checks\?finding=/)
    const card = page.getByRole('article', { name: title })
    await expect(card).toBeVisible()
    await expect(card).toBeFocused()
  })

  test('Checks after the rulebook: not ready, GMO Fail with quote, barcode proof', async ({ page }) => {
    await openChecks(page)
    await expect(page.getByRole('link', { name: /Print verdict: not ready to print/ })).toBeVisible()

    const gmo = page.locator('[data-group="fail"] [data-finding-id="f-rule-df-16"]')
    await expect(gmo).toBeVisible()
    await expect(gmo).toContainText(/GMO/i)
    await expect(gmo.getByLabel('Rules')).toContainText('DF-16')
    await expect(gmo).toContainText('Quote checked by code')
    await expect(gmo.locator('[data-evidence] .italic').first()).not.toBeEmpty()

    await page.getByRole('group', { name: 'Filter checks' }).getByRole('button', { name: /^Checked and fine/ }).click()
    const barcode = page.locator('[data-cleared-id]').filter({ hasText: /barcode/i }).first()
    await expect(barcode).toBeVisible()
    await expect(barcode).toContainText(/check.?digit/i)
  })

  test('review decision is kept by the backend across a reload', async ({ page }) => {
    await openChecks(page)
    const card = page.locator('[data-group="review"] [data-finding-card]').filter({ has: page.getByRole('button', { name: "It's fine" }) }).first()
    const id = await card.getAttribute('data-finding-id')
    await card.getByLabel('Your name').fill('Maya Tester')
    await card.getByRole('button', { name: "It's fine" }).click()
    const decided = page.locator(`[data-finding-id="${id}"]`)
    await expect(decided.locator('[data-decision]')).toContainText('Maya Tester decided: it\'s fine')

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Checks', level: 1 })).toBeVisible()
    await expect(page.locator(`[data-finding-id="${id}"] [data-decision]`)).toContainText('Maya Tester decided: it\'s fine')
  })

  test('ask about a finding gives an answer or a refusal reason', async ({ page }) => {
    await openChecks(page)
    const card = page.locator('[data-group="fail"]').getByRole('article').first()
    await card.getByRole('button', { name: /^Ask about this finding/ }).click()
    const panel = page.getByRole('complementary', { name: 'Ask about this' })
    await expect(panel.getByRole('region', { name: 'Finding in question' })).toBeVisible()
    await panel.getByLabel('Your question').fill('Why is this a fail?')
    await panel.getByRole('button', { name: 'Ask', exact: true }).click()
    await expect(panel.getByRole('region', { name: 'Answer' })).toBeVisible()
    await expect(panel.getByRole('alert')).toHaveCount(0)
  })

  test('Show on artwork opens the marked-up artwork on that finding', async ({ page }) => {
    await openChecks(page)
    const card = page.locator('[data-group="fail"] [data-finding-card]').filter({ has: page.getByRole('link', { name: 'Show on artwork' }) }).first()
    const title = (await card.getByRole('heading', { level: 3 }).textContent()) ?? ''
    await card.getByRole('link', { name: 'Show on artwork' }).click()
    await expect(page).toHaveURL(/\/markup\?finding=/)
    await expect(page.getByRole('heading', { name: 'Marked-up artwork', level: 1 })).toBeVisible()
    const focus = page.getByRole('region', { name: 'Check on the artwork' })
    await expect(focus).toContainText(title)
    await expect(focus).toContainText('Its mark is selected below.')
  })

  test('Report: verdict, Fail section, Rules used, Sign-off, Print report', async ({ page }) => {
    await page.evaluate(() => {
      ;(window as unknown as { __printed: number }).__printed = 0
      window.print = () => {
        ;(window as unknown as { __printed: number }).__printed++
      }
    })
    await nav(page).getByRole('link', { name: /Report/ }).click()
    await expect(page.getByRole('heading', { name: 'Report', level: 1 })).toBeVisible()
    await expect(page.locator('[data-report-verdict]')).toContainText(/not ready/i)
    await expect(page.getByRole('heading', { name: /^Fail/, level: 2 })).toBeVisible()
    expect(await page.locator('[data-report-finding][data-verdict="fail"]').count()).toBeGreaterThan(0)
    await expect(page.getByRole('heading', { name: /^Rules used/, level: 2 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Sign-off', level: 2 })).toBeVisible()

    await page.getByRole('button', { name: 'Print report' }).click()
    await expect.poll(() => page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1)
  })
})
