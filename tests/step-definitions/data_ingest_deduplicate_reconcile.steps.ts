import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Given, Then, When } from '@cucumber/cucumber'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { EventCard } from '../../src/components/EventCard.tsx'
import { BREAKDOWN_UNAVAILABLE_TEXT, NO_DATA_TEXT } from '../../src/components/copy.ts'
import { parseEvents, parseRegistrations } from '../../src/services/parsers.ts'
import { reconcile } from '../../src/services/reconcile.ts'
import type {
  EventRecord,
  EventSummary,
  ReconciliationResult,
  Registration,
} from '../../src/types.ts'

interface World {
  events: EventRecord[]
  registrations: Registration[]
  subset: Registration[]
  result?: ReconciliationResult
  cardHtml?: string
  summary?: EventSummary
}

const read = (file: string): string => readFileSync(resolve(process.cwd(), file), 'utf8')

function world(ctx: unknown): World {
  return ctx as World
}

function summaryFor(w: World, eventId: string): EventSummary {
  assert.ok(w.result, 'reconciliation has not run')
  const summary = w.result.summaries.find((s) => s.event.event_id === eventId)
  assert.ok(summary, `no summary for ${eventId}`)
  return summary
}

function rowsFor(w: World, name: string, eventId: string): Registration[] {
  const [first, ...rest] = name.split(' ')
  return w.registrations.filter(
    (r) => r.firstName === first && r.lastName === rest.join(' ') && r.eventId === eventId,
  )
}

function total(summary: EventSummary): number {
  assert.ok(summary.breakdown)
  const { Accepted, Pending, Cancelled } = summary.breakdown
  return Accepted + Pending + Cancelled
}

/** Text of the card with markup stripped. */
function cardText(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
}

Given('the master event schedule is loaded from {string}', function (file: string) {
  world(this).events = parseEvents(JSON.parse(read(file)))
})

Given('the live registration export is loaded from {string}', function (file: string) {
  world(this).registrations = parseRegistrations(read(file))
})

// Scenario 1
Given(
  '{string} contains rows with event labels like {string}',
  function (_file: string, label: string) {
    const w = world(this)
    w.subset = w.registrations
    assert.ok(w.registrations.some((r) => r.eventLabel === label), `no row labelled ${label}`)
  },
)

When('the dashboard processes the registration rows', function () {
  const w = world(this)
  w.result = reconcile(w.events, w.subset)
})

Then('it should extract the leading event ID {string}', function (id: string) {
  const w = world(this)
  const rows = w.registrations.filter((r) => r.eventLabel.startsWith(`${id} `))
  assert.ok(rows.length > 0)
  assert.ok(rows.every((r) => r.eventId === id))
})

Then(
  'group all matching rows under event {string} from {string}',
  function (id: string, _file: string) {
    const w = world(this)
    const summary = summaryFor(w, id)
    assert.equal(summary.source, 'live')
    const expected = w.registrations.filter((r) => r.eventId === id).length
    assert.equal(total(summary) + summary.duplicatesFiltered, expected)
  },
)

Then(
  'count registrations separately by status {string}, {string}, and {string}',
  function (a: string, p: string, c: string) {
    const summary = summaryFor(world(this), 'E125')
    assert.ok(summary.breakdown)
    assert.deepEqual(Object.keys(summary.breakdown).sort(), [a, p, c].sort())
    assert.deepEqual(summary.breakdown, { Accepted: 36, Pending: 4, Cancelled: 4 })
  },
)

// Scenarios 2 & 3
Given(
  '{string} contains two rows for {string} on event {string}',
  function (_file: string, name: string, id: string) {
    const w = world(this)
    w.subset = rowsFor(w, name, id)
    assert.equal(w.subset.length, 2)
  },
)

Given(
  'both rows share the same normalized mobile {string} and timestamp {string}',
  function (mobile: string, ts: string) {
    for (const r of world(this).subset) {
      assert.equal(r.mobile.replace(/\D/g, '').replace(/^61/, '0'), mobile)
      assert.equal(r.registeredAt, ts)
    }
  },
)

Given(
  'row {string} has timestamp {string} and mobile {string}',
  function (id: string, ts: string, mobile: string) {
    const row = world(this).subset.find((r) => r.registrationId === id)
    assert.ok(row, `row ${id} missing`)
    assert.equal(row.registeredAt, ts)
    assert.equal(row.mobile.replace(/\s/g, ''), mobile)
  },
)

When('deduplication is active', function () {
  const w = world(this)
  w.result = reconcile(w.events, w.subset, { deduplicate: true })
})

Then(
  'only {int} registration should be counted for {string} on {string}',
  function (count: number, _name: string, id: string) {
    assert.equal(total(summaryFor(world(this), id)), count)
  },
)

Then('the duplicate submission counter should increment by {int}', function (n: number) {
  const w = world(this)
  assert.ok(w.result)
  const without = reconcile(w.events, w.subset, { deduplicate: false })
  assert.equal(w.result.duplicateCount - without.duplicateCount, n)
})

Then('both rows should be kept as separate registrations for {string}', function (id: string) {
  const w = world(this)
  assert.ok(w.result)
  assert.equal(w.result.duplicateCount, 0)
  assert.equal(total(summaryFor(w, id)), 2)
})

// Scenario 4
Given(
  'event {string} \\({string}, Melbourne) exists in {string} with target {int} and current_registrations {int}',
  function (id: string, name: string, _file: string, target: number, current: number) {
    const event = world(this).events.find((e) => e.event_id === id)
    assert.ok(event)
    assert.equal(event.name, name)
    assert.equal(event.city, 'Melbourne')
    assert.equal(event.target_registrations, target)
    assert.equal(event.current_registrations, current)
  },
)

// Scenario 5
Given(
  'event {string} \\({string}, Auckland) has {string} set to null in {string}',
  function (id: string, name: string, field: string, _file: string) {
    const event = world(this).events.find((e) => e.event_id === id)
    assert.ok(event)
    assert.equal(event.name, name)
    assert.equal(event.city, 'Auckland')
    assert.equal((event as unknown as Record<string, unknown>)[field], null)
  },
)

Given('{string} has no rows in {string}', function (id: string, _file: string) {
  const w = world(this)
  assert.equal(w.registrations.filter((r) => r.eventId === id).length, 0)
})

When('the dashboard renders the summary for {string}', function (id: string) {
  const w = world(this)
  w.result = reconcile(w.events, w.registrations)
  w.summary = summaryFor(w, id)
  w.cardHtml = renderToStaticMarkup(createElement(EventCard, { summary: w.summary }))
})

Then(
  'it should use {int} as the confirmed progress count against the target of {int}',
  function (count: number, target: number) {
    const { summary, cardHtml } = world(this)
    assert.ok(summary && cardHtml)
    assert.equal(summary.confirmed, count)
    assert.equal(summary.target, target)
    assert.match(cardText(cardHtml), new RegExp(`${count} of ${target} `))
  },
)

Then(
  'it should indicate that individual {string}, {string}, and {string} breakdowns are unavailable',
  function (_a: string, _p: string, _c: string) {
    const { cardHtml } = world(this)
    assert.ok(cardHtml)
    assert.ok(cardHtml.includes(BREAKDOWN_UNAVAILABLE_TEXT))
  },
)

Then('it should not display {string} for Pending or Cancelled counts', function (zero: string) {
  const { cardHtml, summary } = world(this)
  assert.ok(cardHtml && summary)
  assert.equal(summary.breakdown, null)
  assert.ok(!/data-testid="status-(Pending|Cancelled)"/.test(cardHtml))
  assert.ok(!new RegExp(`(Pending|Cancelled)\\s*:?\\s*${zero}\\b`).test(cardText(cardHtml)))
})

Then(
  'the progress bar should default to {int} of {int} \\({int}%)',
  function (count: number, target: number, pct: number) {
    const { summary, cardHtml } = world(this)
    assert.ok(summary && cardHtml)
    assert.equal(summary.confirmed, count)
    assert.equal(summary.target, target)
    assert.equal(summary.percent, pct)
    assert.match(cardText(cardHtml), new RegExp(`${count} of ${target} \\(${pct}%\\)`))
    assert.match(cardHtml, new RegExp(`<progress[^>]*value="${count}"`))
  },
)

Then('the card should display a {string} label', function (label: string) {
  const { cardHtml } = world(this)
  assert.ok(cardHtml)
  assert.equal(label, NO_DATA_TEXT)
  assert.ok(cardText(cardHtml).includes(label))
})
