import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Given, Then, When } from '@cucumber/cucumber'
import type { Locator } from 'playwright'
import type { AppWorld } from '../support/world.ts'

const POLL_MS = 60_000
const CSV_PATH = 'public/registrations.csv'
const EVENTS_PATH = 'public/events.json'

interface SyncState {
  requests: string[]
  lastSyncedBefore?: string
  liveRowsBefore?: number
  uploadedRows?: number
  cardIdsBeforeUpload?: string[]
  tabCounts: Map<string, number>
  activeTab?: string
}
const states = new WeakMap<object, SyncState>()
function st(world: unknown): SyncState {
  let s = states.get(world as object)
  if (!s) {
    s = { requests: [], tabCounts: new Map() }
    states.set(world as object, s)
  }
  return s
}

const readCsv = () => readFileSync(CSV_PATH, 'utf8')
const dataRequests = (w: AppWorld) => st(w).requests.filter((u) => /\/(events\.json|registrations\.csv)(\?|$)/.test(u))
const liveRows = async (w: AppWorld) =>
  Number((await w.page.locator('dt', { hasText: 'Live rows' }).locator('xpath=following-sibling::dd').innerText()).trim())
const lastSynced = async (w: AppWorld) => (await w.page.getByTestId('last-synced').innerText()).trim()
const cardIds = (w: AppWorld) =>
  w.page
    .locator('[data-testid^="event-card-"]')
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.testid!.replace('event-card-', '')))
const dedupeToggle = (w: AppWorld) => w.page.getByLabel('Remove duplicate submissions')
const acceptedText = async (w: AppWorld, id: string) =>
  (await w.page.getByTestId(`event-card-${id}`).getByTestId('status-Accepted').innerText()).trim()

async function waitForLastSyncedChange(w: AppWorld, before: string) {
  await w.page.waitForFunction(
    (b) => document.querySelector('[data-testid="last-synced"]')?.textContent?.trim() !== b,
    before,
    { timeout: 10_000 },
  )
}

// ---------- Background ----------

Given('the dashboard is open in a web browser', async function (this: AppWorld) {
  const s = st(this)
  // Fake clock (time still flows) so the 60s poll can be fast-forwarded deterministically.
  await this.page.clock.install()
  this.page.on('request', (r) => s.requests.push(r.url()))
  await this.page.goto(this.baseUrl)
})

Given(
  'the initial data has loaded from {string} and {string}',
  async function (this: AppWorld, _events: string, _csv: string) {
    await this.page.getByTestId('kpi-upcomingConfirmedSeats').waitFor()
    await this.page.locator('[data-testid^="event-card-"]').first().waitFor()
    const urls = dataRequests(this)
    assert.ok(urls.some((u) => u.includes('events.json')), 'events.json was not requested')
    assert.ok(urls.some((u) => u.includes('registrations.csv')), 'registrations.csv was not requested')
  },
)

// ---------- Scenario 1: auto refresh ----------

Given('the dashboard displays the {string} timestamp in the header', async function (this: AppWorld, label: string) {
  const text = await lastSynced(this)
  assert.ok(text.includes(label), `header should contain "${label}", got "${text}"`)
  const s = st(this)
  s.lastSyncedBefore = text
  s.liveRowsBefore = await liveRows(this)
  // From now on, serve a trimmed CSV so a refresh visibly changes the rollups.
  const trimmed = readCsv().split(/\r?\n/).slice(0, 61).join('\n')
  await this.page.route('**/registrations.csv*', (route) =>
    route.fulfill({ status: 200, contentType: 'text/csv', body: trimmed }),
  )
  s.requests.length = 0
})

When('{int} seconds elapse', async function (this: AppWorld, seconds: number) {
  assert.equal(seconds * 1000, POLL_MS)
  await this.page.clock.fastForward(seconds * 1000 + 500)
  await this.page.waitForResponse((r) => r.url().includes('registrations.csv')).catch(() => undefined)
})

Then(
  'the dashboard should re-fetch {string} and {string} with a cache-busting query parameter',
  async function (this: AppWorld, events: string, csv: string) {
    await this.page.waitForFunction(() => performance.now() > 0)
    const urls = dataRequests(this)
    for (const file of [events, csv]) {
      const hit = urls.find((u) => u.includes(file) && /[?&][^=&]+=\d+/.test(new URL(u).search))
      assert.ok(hit, `no cache-busted re-fetch of ${file}; saw ${JSON.stringify(urls)}`)
    }
  },
)

Then(
  'recalculate all KPI rollups, progress bars, and attention statuses',
  async function (this: AppWorld) {
    const s = st(this)
    await this.page.waitForFunction(
      (before) => {
        const dd = [...document.querySelectorAll('dt')]
          .find((e) => e.textContent?.includes('Live rows'))
          ?.nextElementSibling
        return Number(dd?.textContent) !== before
      },
      s.liveRowsBefore,
      { timeout: 10_000 },
    )
    assert.ok((await liveRows(this)) < s.liveRowsBefore!, 'live row rollup did not reflect refreshed CSV')
    assert.ok((await this.page.locator('[data-testid^="kpi-value-"]').count()) === 4)
    assert.ok((await this.page.locator('progress').count()) > 0, 'progress bars missing after refresh')
    assert.ok((await this.page.locator('[data-testid^="attention-badge-"]').count()) > 0, 'attention badges missing')
  },
)

Then('update the {string} timestamp to reflect the latest sync time', async function (this: AppWorld, _label: string) {
  const before = st(this).lastSyncedBefore!
  await waitForLastSyncedChange(this, before)
  assert.notEqual(await lastSynced(this), before)
})

// ---------- Scenario 2: dedupe toggle ----------

Given(
  '{string} contains {int} duplicate double-submissions alongside {int} unique registrations',
  async function (this: AppWorld, _file: string, dupes: number, unique: number) {
    assert.equal(await liveRows(this), dupes + unique, 'raw row count')
    assert.equal(Number(await this.page.getByTestId('duplicate-count').innerText()), dupes)
  },
)

Given('the {string} toggle is enabled by default', async function (this: AppWorld, label: string) {
  assert.ok(await this.page.getByLabel(label).isChecked(), `"${label}" should be checked by default`)
})

When('the coordinator unchecks the {string} toggle', async function (this: AppWorld, label: string) {
  await this.page.getByLabel(label).uncheck()
})

Then('the dashboard should immediately recalculate using all {int} raw rows', async function (this: AppWorld, raw: number) {
  assert.equal(await liveRows(this), raw)
  assert.equal(Number(await this.page.getByTestId('duplicate-count').innerText()), 0, 'no rows should be filtered')
  const sum = await this.page.locator('[data-testid="status-Accepted"], [data-testid="status-Pending"], [data-testid="status-Cancelled"]').allInnerTexts()
  const total = sum.reduce((a, t) => a + Number(t.trim().split(' ')[0]), 0)
  assert.ok(total >= raw - 20 && total <= raw, `status totals ${total} inconsistent with ${raw} raw rows`)
})

Then(
  'update event {string} Accepted count from {int} to {int}',
  async function (this: AppWorld, id: string, from: number, to: number) {
    assert.equal(await acceptedText(this, id), `${to} Accepted`)
    // Prove the "from" value by checking it is what the deduplicated view shows.
    await dedupeToggle(this).check()
    assert.equal(await acceptedText(this, id), `${from} Accepted`)
    await dedupeToggle(this).uncheck()
    assert.equal(await acceptedText(this, id), `${to} Accepted`)
  },
)

Then('update the Data Hygiene KPI card to indicate duplicates are currently included', async function (this: AppWorld) {
  const card = this.page.getByTestId('kpi-duplicates')
  assert.match(await card.innerText(), /Duplicates currently included/i)
})

When('the coordinator re-enables the toggle', async function (this: AppWorld) {
  await dedupeToggle(this).check()
})

Then(
  'the dashboard should revert to the deduplicated count of {int} Accepted for {string}',
  async function (this: AppWorld, n: number, id: string) {
    assert.equal(await acceptedText(this, id), `${n} Accepted`)
    assert.doesNotMatch(await this.page.getByTestId('kpi-duplicates').innerText(), /currently included/i)
  },
)

// ---------- Scenario 3: manual upload ----------

Given(
  'a coordinator has downloaded a fresh CSV export {string} on their computer',
  async function (this: AppWorld, _name: string) {
    const s = st(this)
    s.cardIdsBeforeUpload = await cardIds(this)
    s.liveRowsBefore = await liveRows(this)
  },
)

When(
  'they select {string} via the {string} control',
  async function (this: AppWorld, fileName: string, control: string) {
    assert.equal(control, 'Upload New CSV')
    const s = st(this)
    const lines = readCsv().split(/\r?\n/).filter(Boolean)
    const subset = [lines[0], ...lines.slice(1).filter((l) => /^R\d+,E101\b/.test(l))]
    s.uploadedRows = subset.length - 1
    assert.ok(s.uploadedRows > 0, 'fixture needs E101 rows')
    s.requests.length = 0
    await this.page.getByText('Upload New CSV').locator('input[type="file"]').setInputFiles({
      name: fileName,
      mimeType: 'text/csv',
      buffer: Buffer.from(subset.join('\n'), 'utf8'),
    })
  },
)

Then(
  'the dashboard should parse the uploaded file locally in the browser without requiring a server redeploy',
  async function (this: AppWorld) {
    await this.page.waitForFunction(
      () => document.querySelector('[data-testid="data-source"]')?.textContent?.includes('registrations-latest.csv'),
    )
    const uploads = st(this).requests.filter((u) => /registrations-latest/.test(u))
    assert.equal(uploads.length, 0, 'uploaded file must not be sent to a server')
  },
)

Then('update all live-tracked event cards and KPIs using the uploaded rows', async function (this: AppWorld) {
  const s = st(this)
  assert.equal(await liveRows(this), s.uploadedRows)
  const live = await this.page.locator('[data-testid^="event-card-"]', { hasText: 'Live CSV' }).count()
  assert.ok(live >= 1 && live < s.cardIdsBeforeUpload!.length, `live-tracked card count after upload: ${live}`)
  assert.ok(s.uploadedRows! < s.liveRowsBefore!)
})

Then('update the header status to show the loaded filename {string}', async function (this: AppWorld, name: string) {
  assert.match(await this.page.getByTestId('sync-status').innerText(), new RegExp(name.replace('.', '\\.')))
})

Then(
  'pause background polling so the manual upload is not overwritten by the 60-second auto-refresh',
  async function (this: AppWorld) {
    const s = st(this)
    s.requests.length = 0
    await this.page.clock.fastForward(POLL_MS * 3)
    await this.page.waitForTimeout(500)
    assert.deepEqual(dataRequests(this), [], 'no background fetches should occur after upload')
    assert.equal(await liveRows(this), s.uploadedRows)
    assert.match(await this.page.getByTestId('data-source').innerText(), /registrations-latest\.csv/)
  },
)

// ---------- Scenario outline: tabs ----------

Given(
  'the dashboard has loaded events across {string}, {string}, and {string} states',
  async function (this: AppWorld, _a: string, _b: string, _c: string) {
    const badges = await this.page.locator('[data-testid^="attention-badge-"]').allInnerTexts()
    assert.ok(badges.some((b) => b.startsWith('Needs Attention')), 'need a Needs Attention event')
    assert.ok(badges.some((b) => b === 'On Track' || b === 'Target Met'), 'need an On Track event')
    assert.ok(badges.some((b) => b === 'Completed'), 'need a Completed event')
    st(this).tabCounts.set('All Events', badges.length)
  },
)

const tab = (w: AppWorld, name: string): Locator =>
  w.page.getByRole('group', { name: 'Filter events' }).getByRole('button', { name, exact: true })

When('the coordinator clicks the {string} filter tab', async function (this: AppWorld, name: string) {
  st(this).activeTab = name
  await tab(this, name).click()
})

async function cardFacts(w: AppWorld) {
  return w.page.locator('[data-testid^="event-card-"]').evaluateAll((els) =>
    els.map((el) => ({
      id: (el as HTMLElement).dataset.testid!.replace('event-card-', ''),
      attention: el.querySelector('[data-testid^="attention-badge-"]')?.textContent?.trim() ?? '',
      live: /Live CSV/.test(el.textContent ?? ''),
    })),
  )
}

Then(
  'only events matching {string} should be displayed in the event grid',
  async function (this: AppWorld, rule: string) {
    const w = this
    const name = st(w).activeTab!
    const shown = await cardFacts(w)
    const allEvents = JSON.parse(readFileSync(EVENTS_PATH, 'utf8')) as { event_id: string; date: string }[]
    // Reference everything else against the unfiltered grid.
    await tab(w, 'All Events').click()
    const all = await cardFacts(w)
    await tab(w, name).click()

    const ids = shown.map((c) => c.id).sort()
    const expected = (pred: (c: (typeof all)[number]) => boolean) => all.filter(pred).map((c) => c.id).sort()
    switch (name) {
      case 'All Events':
        assert.equal(rule, 'Every event from events.json')
        assert.deepEqual(ids, allEvents.map((e) => e.event_id).sort())
        break
      case 'Needs Attention':
        assert.ok(shown.length > 0)
        assert.ok(shown.every((c) => /^Needs Attention \((Urgent|Behind)\)$/.test(c.attention)), JSON.stringify(shown))
        assert.deepEqual(ids, expected((c) => c.attention.startsWith('Needs Attention')))
        break
      case 'Live CSV Tracked': {
        const csvIds = new Set([...readCsv().matchAll(/^R\d+,(E\d+)\b/gm)].map((m) => m[1]))
        assert.ok(shown.length > 0 && shown.every((c) => c.live))
        assert.deepEqual(ids, [...csvIds].filter((i) => allEvents.some((e) => e.event_id === i)).sort())
        break
      }
      case 'Completed': {
        const today = new Date(await w.page.evaluate(() => Date.now()))
        const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
        const past = allEvents.filter((e) => e.date < iso).map((e) => e.event_id).sort()
        assert.ok(shown.length > 0)
        assert.deepEqual(ids, past)
        break
      }
      default:
        assert.fail(`unknown tab ${name}`)
    }
  },
)

Then('the active tab button should be visually highlighted', async function (this: AppWorld) {
  const name = st(this).activeTab!
  const active = tab(this, name)
  assert.equal(await active.getAttribute('aria-pressed'), 'true')
  assert.match((await active.getAttribute('class')) ?? '', /bg-indigo-600/)
  const buttons = this.page.getByRole('group', { name: 'Filter events' }).getByRole('button')
  const total = await buttons.count()
  let pressed = 0
  for (let i = 0; i < total; i++) {
    if ((await buttons.nth(i).getAttribute('aria-pressed')) === 'true') pressed++
  }
  assert.equal(pressed, 1, 'exactly one active tab')
})

// ---------- Scenario 5: invalid upload ----------

Given('a coordinator selects a malformed or empty file via {string}', async function (this: AppWorld, control: string) {
  assert.equal(control, 'Upload New CSV')
  const s = st(this)
  s.cardIdsBeforeUpload = await cardIds(this)
  s.liveRowsBefore = await liveRows(this)
  const input = this.page.getByText('Upload New CSV').locator('input[type="file"]')
  await input.setInputFiles({ name: 'empty.csv', mimeType: 'text/csv', buffer: Buffer.alloc(0) })
  await this.page.getByRole('alert').waitFor()
  await this.page.reload()
  await this.page.locator('[data-testid^="event-card-"]').first().waitFor()
  // Second check with a malformed (non-registration) file in the same scenario.
  await input.setInputFiles({
    name: 'malformed.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('this is,not\na registrations export\n\u0000\u0001', 'utf8'),
  })
})

When('the CSV parser detects zero valid registration rows', async function (this: AppWorld) {
  await this.page.getByRole('alert').waitFor({ state: 'visible' })
})

Then('the dashboard should display a clear, non-technical error banner', async function (this: AppWorld) {
  const text = (await this.page.getByRole('alert').innerText()).trim()
  assert.match(text, /couldn.t find any registrations/i)
  assert.doesNotMatch(text, /exception|stack|undefined|null|TypeError|SyntaxError|parse error|NaN/i)
})

Then('preserve the previously loaded dashboard data instead of rendering a blank screen', async function (this: AppWorld) {
  const s = st(this)
  assert.deepEqual(await cardIds(this), s.cardIdsBeforeUpload)
  assert.equal(await liveRows(this), s.liveRowsBefore)
  assert.match(await this.page.getByTestId('data-source').innerText(), /Live data/)
  assert.ok((await this.page.locator('main').innerText()).length > 200, 'page appears blank')
})
