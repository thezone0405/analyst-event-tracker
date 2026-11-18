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

  it('returns zeros for no events', () => {
    expect(computeKpis([], 0)).toEqual({
      upcomingConfirmedSeats: 0,
      eventsNeedingAttention: 0,
      pendingReview: 0,
      duplicates: 0,
    })
  })
})
