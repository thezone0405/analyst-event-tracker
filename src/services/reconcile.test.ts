import { describe, expect, it } from 'vitest'
import { makeEvent, makeRegistration } from '../test/fixtures'
import {
  countByStatus,
  groupByEventId,
  percentOf,
  reconcile,
  summarizeEvent,
} from './reconcile'

describe('countByStatus', () => {
  it('counts each known status and ignores unrecognised ones', () => {
    expect(
      countByStatus([
        makeRegistration({ status: 'Accepted' }),
        makeRegistration({ status: 'Accepted' }),
        makeRegistration({ status: 'Pending' }),
        makeRegistration({ status: 'Cancelled' }),
        makeRegistration({ status: null }),
      ]),
    ).toEqual({ Accepted: 2, Pending: 1, Cancelled: 1 })
  })
})

describe('percentOf', () => {
  it('rounds to a whole percentage', () => {
    expect(percentOf(9, 30)).toBe(30)
    expect(percentOf(1, 3)).toBe(33)
    expect(percentOf(46, 45)).toBe(102)
  })

  it('returns 0 for a non-positive target', () => {
    expect(percentOf(5, 0)).toBe(0)
    expect(percentOf(5, -1)).toBe(0)
  })
})

describe('groupByEventId', () => {
  it('groups rows by event ID and skips rows without one', () => {
    const groups = groupByEventId([
      makeRegistration({ registrationId: 'a', eventId: 'E101' }),
      makeRegistration({ registrationId: 'b', eventId: 'E125' }),
      makeRegistration({ registrationId: 'c', eventId: 'E101' }),
      makeRegistration({ registrationId: 'd', eventId: null }),
    ])
    expect([...groups.keys()]).toEqual(['E101', 'E125'])
    expect(groups.get('E101')?.map((r) => r.registrationId)).toEqual(['a', 'c'])
  })
})

describe('summarizeEvent', () => {
  it('uses live rows and Accepted count when the event has live rows', () => {
    const summary = summarizeEvent(
      makeEvent({ target_registrations: 10, current_registrations: 99 }),
      [makeRegistration({ status: 'Accepted' }), makeRegistration({ status: 'Pending' })],
      2,
    )
    expect(summary).toMatchObject({
      source: 'live',
      confirmed: 1,
      target: 10,
      percent: 10,
      breakdown: { Accepted: 1, Pending: 1, Cancelled: 0 },
      duplicatesFiltered: 2,
    })
  })

  it('falls back to the nightly snapshot without a breakdown', () => {
    const summary = summarizeEvent(
      makeEvent({ event_id: 'E126', target_registrations: 30, current_registrations: 9 }),
      [],
    )
    expect(summary).toMatchObject({
      source: 'snapshot',
      confirmed: 9,
      target: 30,
      percent: 30,
      breakdown: null,
      duplicatesFiltered: 0,
    })
  })

  it('treats a snapshot of 0 as reported data, not missing data', () => {
    const summary = summarizeEvent(makeEvent({ current_registrations: 0 }), [])
    expect(summary.source).toBe('snapshot')
    expect(summary.confirmed).toBe(0)
  })

  it('defaults to 0 with source "none" when the snapshot is null', () => {
    const summary = summarizeEvent(
      makeEvent({ event_id: 'E155', target_registrations: 25, current_registrations: null }),
      [],
    )
    expect(summary).toMatchObject({
      source: 'none',
      confirmed: 0,
      target: 25,
      percent: 0,
      breakdown: null,
    })
  })

  it('clamps a negative target to 0', () => {
    expect(summarizeEvent(makeEvent({ target_registrations: -5 }), []).target).toBe(0)
  })
})

describe('reconcile', () => {
  const events = [
    makeEvent({ event_id: 'E101' }),
    makeEvent({ event_id: 'E126', current_registrations: 9 }),
  ]
  const original = makeRegistration({ registrationId: 'R1012', eventId: 'E101' })
  const duplicate = makeRegistration({ registrationId: 'R1312', eventId: 'E101' })
  const unknownEvent = makeRegistration({ registrationId: 'R9', eventId: 'E999', mobile: '0411' })
  const noId = makeRegistration({ registrationId: 'R10', eventId: null, mobile: '0422' })

  it('deduplicates by default and reports duplicates per event and overall', () => {
    const result = reconcile(events, [original, duplicate])
    expect(result.duplicateCount).toBe(1)
    expect(result.summaries[0]).toMatchObject({ confirmed: 1, duplicatesFiltered: 1 })
  })

  it('counts every row when deduplication is disabled', () => {
    const result = reconcile(events, [original, duplicate], { deduplicate: false })
    expect(result.duplicateCount).toBe(0)
    expect(result.summaries[0]).toMatchObject({ confirmed: 2, duplicatesFiltered: 0 })
  })

  it('returns one summary per scheduled event in schedule order', () => {
    const result = reconcile(events, [original])
    expect(result.summaries.map((s) => [s.event.event_id, s.source])).toEqual([
      ['E101', 'live'],
      ['E126', 'snapshot'],
    ])
  })

  it('reports rows that do not match a scheduled event', () => {
    const result = reconcile(events, [original, unknownEvent, noId])
    expect(result.unmatchedRows.map((r) => r.registrationId)).toEqual(['R9', 'R10'])
  })
})
