import { describe, expect, it } from 'vitest'
import {
  ALL_CLEAR_TEXT,
  buildDigestText,
  findBehindTargetEvents,
  formatDigestLine,
  formatDigestText,
} from './aggregator'
import { makeEvent, makeRegistration } from '../test/fixtures'
import { summarizeEvent } from '../services/reconcile'

const TODAY = '2026-11-16'

function summary(id: string, date: string, target: number, confirmed: number, pending = 0) {
  const event = makeEvent({ event_id: id, date, target_registrations: target, name: `Event ${id}` })
  const rows = [
    ...Array.from({ length: confirmed }, (_, i) =>
      makeRegistration({ registrationId: `${id}-A${i}`, eventId: id, status: 'Accepted' }),
    ),
    ...Array.from({ length: pending }, (_, i) =>
      makeRegistration({ registrationId: `${id}-P${i}`, eventId: id, status: 'Pending' }),
    ),
  ]
  return summarizeEvent(event, rows)
}

describe('findBehindTargetEvents', () => {
  it('keeps upcoming behind events within 10 days, soonest first', () => {
    const result = findBehindTargetEvents(
      [
        summary('E130', '2026-11-19', 25, 4),
        summary('E125', '2026-11-18', 50, 36, 4),
        summary('E101', '2026-11-19', 60, 36, 2),
      ],
      TODAY,
    )
    expect(result.map((e) => e.eventId)).toEqual(['E125', 'E101', 'E130'])
    expect(result[0]).toMatchObject({ daysUntil: 2, confirmed: 36, target: 50, percent: 72, pending: 4 })
  })

  it('excludes past, on-track, far-future and boundary-85% events', () => {
    const result = findBehindTargetEvents(
      [
        summary('E114', '2026-11-10', 45, 10),
        summary('E141', '2026-11-20', 30, 31),
        summary('E150', '2026-11-27', 100, 1),
        summary('E160', '2026-11-20', 100, 85),
        summary('E161', '2026-11-26', 100, 84),
        summary('E162', '2026-11-16', 100, 10),
      ],
      TODAY,
    )
    expect(result.map((e) => e.eventId)).toEqual(['E162', 'E161'])
  })

  it('treats missing breakdown as zero pending', () => {
    const snapshot = summarizeEvent(
      makeEvent({ date: '2026-11-17', current_registrations: 1 }),
      [],
    )
    expect(findBehindTargetEvents([snapshot], TODAY)[0].pending).toBe(0)
  })
})

describe('formatting', () => {
  it('shows pending only when greater than zero and pluralises days', () => {
    const base = { eventId: 'E1', name: 'N', city: 'C', daysUntil: 1, confirmed: 1, target: 4, percent: 25 }
    expect(formatDigestLine({ ...base, pending: 0 })).toBe('• E1 N (C) | 1 day to go | 1/4 confirmed (25%)')
    expect(formatDigestLine({ ...base, daysUntil: 3, pending: 2 })).toBe(
      '• E1 N (C) | 3 days to go | 1/4 confirmed (25%) | 2 pending',
    )
  })

  it('returns the all-clear text when nothing is behind', () => {
    expect(formatDigestText([])).toBe(ALL_CLEAR_TEXT)
    expect(ALL_CLEAR_TEXT).toContain('on track')
  })

  it('uses a singular header for one event and a plural one for several', () => {
    const e = { eventId: 'E1', name: 'N', city: 'C', daysUntil: 1, confirmed: 1, target: 4, percent: 25, pending: 0 }
    expect(formatDigestText([e])).toContain('1 event behind target')
    expect(formatDigestText([e, e])).toContain('2 events behind target')
  })
})

describe('buildDigestText', () => {
  it('deduplicates registrations before counting', () => {
    const event = makeEvent({ event_id: 'E101', date: '2026-11-18', target_registrations: 10 })
    const row = makeRegistration({ registrationId: 'R1' })
    const dupe = makeRegistration({ registrationId: 'R2' })
    const text = buildDigestText([event], [row, dupe], TODAY)
    expect(text).toContain('1/10 confirmed')
  })
})
