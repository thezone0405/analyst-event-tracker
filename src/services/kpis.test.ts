import { describe, expect, it } from 'vitest'
import { makeEvent, makeRegistration } from '../test/fixtures'
import { prioritize } from './attention'
import { computeKpis } from './kpis'
import { summarizeEvent } from './reconcile'

describe('computeKpis', () => {
  it('sums upcoming seats, attention events, pending rows and duplicates', () => {
    const live = summarizeEvent(
      makeEvent({ event_id: 'E130', date: '2026-11-19', target_registrations: 25 }),
      [
        makeRegistration({ status: 'Accepted' }),
        makeRegistration({ status: 'Pending' }),
        makeRegistration({ status: 'Pending' }),
      ],
    )
    const past = summarizeEvent(
      makeEvent({ event_id: 'E114', date: '2026-11-10', current_registrations: 40 }),
      [],
    )
    const items = prioritize([live, past], '2026-11-16')

    expect(computeKpis(items, 3)).toEqual({
      upcomingConfirmedSeats: 1,
      eventsNeedingAttention: 1,
      pendingReview: 2,
      duplicates: 3,
    })
  })

  it('counts seats for an event happening today (0 days remaining) but not yesterday (-1)', () => {
    const today = summarizeEvent(makeEvent({ event_id: 'E200', date: '2026-11-16' }), [
      makeRegistration({ status: 'Accepted' }),
      makeRegistration({ status: 'Accepted' }),
    ])
    const yesterday = summarizeEvent(makeEvent({ event_id: 'E201', date: '2026-11-15' }), [
      makeRegistration({ status: 'Accepted' }),
    ])
    const items = prioritize([today, yesterday], '2026-11-16')

    expect(items.map(({ attention }) => attention.daysRemaining).sort()).toEqual([-1, 0])
    expect(computeKpis(items, 0).upcomingConfirmedSeats).toBe(2)
    expect(computeKpis(items.filter(({ attention }) => attention.daysRemaining === 0), 0).upcomingConfirmedSeats).toBe(2)
  })

  it('returns zeros for no events', () => {
    expect(computeKpis([], 0)).toEqual({
      upcomingConfirmedSeats: 0,
      eventsNeedingAttention: 0,
      pendingReview: 0,
      duplicates: 0,
    })
  })
})
