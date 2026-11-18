import assert from 'node:assert/strict'
import { Given, Then, When, type DataTable } from '@cucumber/cucumber'
import type { AppWorld } from '../support/world.ts'

const FLAGGED = new Set(['Needs Attention (Urgent)', 'Needs Attention (Behind)'])

interface CardState {
  eventId?: string
}
const state = (w: unknown) => w as CardState

Given('the web application is deployed and accessible at a public URL', async function (this: AppWorld) {
  const response = await this.page.request.get(this.baseUrl)
  assert.ok(response.ok(), `expected 2xx from ${this.baseUrl}, got ${response.status()}`)
})

When('a user opens the dashboard in their browser', async function (this: AppWorld) {
  await this.page.goto(this.baseUrl)
  await this.page.getByTestId('kpi-upcomingConfirmedSeats').waitFor()
  await this.page.locator('[data-testid^="event-card-"]').first().waitFor()
})

Then('they should see top-level KPI cards for:', async function (this: AppWorld, table: DataTable) {
  for (const [label] of table.raw().slice(1)) {
    const card = this.page.locator('[data-testid^="kpi-"]:not([data-testid^="kpi-value-"])', { hasText: label })
    assert.equal(await card.count(), 1, `KPI card "${label}" should be visible exactly once`)
    await card.waitFor({ state: 'visible' })
    assert.match((await card.locator('[data-testid^="kpi-value-"]').innerText()).trim(), /^\d+$/)
  }
})

Then(
  'an {string} alert banner should list all events flagged as needing attention',
  async function (this: AppWorld, title: string) {
    const banner = this.page.getByTestId('action-required')
    await banner.waitFor({ state: 'visible' })
    assert.equal(await banner.getByRole('heading', { name: title }).count(), 1)
    const flagged = await this.page
      .locator('[data-testid^="attention-badge-"]', { hasText: 'Needs Attention' })
      .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.testid!.replace('attention-badge-', '')))
    const listed = await banner
      .locator('[data-testid^="action-item-"]')
      .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.testid!.replace('action-item-', '')))
    assert.ok(flagged.length > 0, 'expected at least one flagged event')
    assert.deepEqual([...listed].sort(), [...flagged].sort())
    const kpi = Number(await this.page.getByTestId('kpi-value-eventsNeedingAttention').innerText())
    assert.equal(kpi, flagged.length)
  },
)

Then(
  'events needing attention should appear before on-track and completed events',
  async function (this: AppWorld) {
    const badges = await this.page
      .locator('[data-testid^="attention-badge-"]')
      .evaluateAll((els) => els.map((e) => e.textContent!.trim()))
    const ranks = badges.map((b) => (FLAGGED.has(b) ? 0 : 1))
    assert.ok(ranks.includes(0) && ranks.includes(1), 'need both flagged and unflagged events')
    assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), `ordering wrong: ${badges.join(' | ')}`)
  },
)

Given(
  'event {string} \\({string}) is present in {string}',
  async function (this: AppWorld, id: string, name: string, file: string) {
    const csv = await (await this.page.request.get(new URL(file, this.baseUrl).href)).text()
    assert.ok(csv.includes(`${id} ${name}`), `${id} ${name} not found in ${file}`)
    state(this).eventId = id
  },
)

When('the user views the card for {string}', async function (this: AppWorld, id: string) {
  await this.page.goto(this.baseUrl)
  await this.page.getByTestId(`event-card-${id}`).waitFor()
})

const card = (w: AppWorld) => w.page.getByTestId(`event-card-${state(w).eventId}`)

Then(
  'the card should display the event name, city, date, and days remaining',
  async function (this: AppWorld) {
    const c = card(this)
    const text = await c.innerText()
    assert.match(text, /Sydney Cloud Security Summit/)
    assert.match(text, /Sydney/)
    assert.match(text, /2026-11-19/)
    assert.match(await c.getByTestId('days-remaining').innerText(), /remaining|Today|passed/)
  },
)

Then('a visual progress bar showing {string}', async function (this: AppWorld, text: string) {
  const c = card(this)
  assert.equal(await c.locator('progress').count(), 1)
  assert.equal((await c.getByTestId('progress-text').innerText()).trim(), text)
})

Then('the remaining gap text {string}', async function (this: AppWorld, text: string) {
  assert.equal((await card(this).getByTestId('gap-text').innerText()).trim(), text)
})

Then(
  'distinct status counts showing {string}, {string}, and {string}',
  async function (this: AppWorld, a: string, b: string, c: string) {
    for (const t of [a, b, c]) {
      const status = t.split(' ')[1]
      assert.equal((await card(this).getByTestId(`status-${status}`).innerText()).trim(), t)
    }
  },
)
