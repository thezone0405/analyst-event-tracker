import assert from 'node:assert/strict'
import { Given, Then, When } from '@cucumber/cucumber'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Dashboard } from '../../src/components/Dashboard.tsx'
import { evaluateAttention, prioritize, type AttentionResult } from '../../src/services/attention.ts'
import type { EventRecord, EventSummary } from '../../src/types.ts'

interface AttentionWorld {
  today?: string
  eventId?: string
  eventDate?: string
  eventName?: string
  target?: number
  confirmed?: number
  result?: AttentionResult
  html?: string
  prioritizedIds?: string[]
}

const w = (ctx: unknown): AttentionWorld => ctx as AttentionWorld

function record(id: string, name: string, date: string, target: number): EventRecord {
  return {
    event_id: id,
    name,
    city: 'Test City',
    date,
    type: 'Dinner',
    target_registrations: target,
    current_registrations: null,
    launched: 'Yes',
  }
}

Given('the current reference date is {string}', function (today: string) {
  w(this).today = today
})

Given(
  'an event {string} is scheduled for {string} with a target of {int} registrations',
  function (id: string, date: string, target: number) {
    Object.assign(w(this), { eventId: id, eventDate: date, target })
  },
)

Given('the event has {int} confirmed registrations', function (confirmed: number) {
  w(this).confirmed = confirmed
})

When('the attention rules evaluate {string}', function (id: string) {
  const s = w(this)
  assert.equal(s.eventId, id)
  s.result = evaluateAttention(s.eventDate!, s.confirmed!, s.target!, s.today!)
})

Then('the progress percentage should be {string}', function (pct: string) {
  assert.equal(`${w(this).result!.percent}%`, pct)
})

Then('the event status badge should be {string}', function (badge: string) {
  assert.equal(w(this).result!.badge, badge)
})

Then('the needs-attention flag should be {string}', function (flag: string) {
  assert.equal(String(w(this).result!.needsAttention), flag)
})

Given(
  'event {string} \\({string}\\) took place on {string}',
  function (id: string, name: string, date: string) {
    Object.assign(w(this), { eventId: id, eventName: name, eventDate: date, target: 45, confirmed: 42 })
  },
)

Given('the current date is after {string}', function (date: string) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 6)
  w(this).today = d.toISOString().slice(0, 10)
})

When('the dashboard sorts and prioritizes events', function () {
  const s = w(this)
  const event = record(s.eventId!, s.eventName!, s.eventDate!, s.target!)
  const summary: EventSummary = {
    event,
    source: 'snapshot',
    confirmed: s.confirmed!,
    target: s.target!,
    percent: Math.round((s.confirmed! / s.target!) * 100),
    breakdown: null,
    duplicatesFiltered: 0,
  }
  s.prioritizedIds = prioritize([summary], s.today!).map((p) => p.summary.event.event_id)
  s.result = evaluateAttention(s.eventDate!, s.confirmed!, s.target!, s.today!)
  s.html = renderToStaticMarkup(
    createElement(Dashboard, {
      events: [{ ...event, current_registrations: s.confirmed! }],
      registrations: [],
      today: s.today!,
    }),
  )
})

Then('{string} should be marked as {string}', function (id: string, badge: string) {
  const s = w(this)
  assert.equal(s.eventId, id)
  assert.equal(s.result!.badge, badge)
  assert.ok(s.html!.includes(badge), 'badge not rendered on the dashboard')
})

Then('{string} should not appear in the top {string} alert banner', function (id: string, _banner: string) {
  const html = w(this).html!
  assert.ok(!html.includes(`action-item-${id}`), 'event appears in banner')
  assert.ok(!html.includes('data-testid="action-required"'), 'banner rendered')
})
