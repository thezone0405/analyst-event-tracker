/**
 * Unit-level coverage of specs/features/data_ingest_deduplicate_reconcile.feature,
 * run against the real data files shipped in public/data/.
 */
import { describe, expect, it } from 'vitest'
import eventsJson from '../../public/data/events.json?raw'
import registrationsCsv from '../../public/data/registrations.csv?raw'
import type { EventSummary } from '../types'
import { parseEvents, parseRegistrations } from './parsers'
import { reconcile } from './reconcile'

const events = parseEvents(JSON.parse(eventsJson))
const registrations = parseRegistrations(registrationsCsv)

function summaryFor(summaries: EventSummary[], eventId: string): EventSummary {
  const summary = summaries.find((s) => s.event.event_id === eventId)
  if (!summary) throw new Error(`No summary for ${eventId}`)
  return summary
}

describe('Feature: Reconcile live CSV registrations with nightly event targets', () => {
  it('loads the master schedule and live export', () => {
    expect(events).toHaveLength(8)
    expect(registrations).toHaveLength(145)
  })

  describe('Scenario: Map live CSV registrations to events using the event ID prefix', () => {
    it('extracts the leading event ID "E125" from labels', () => {
      const e125Rows = registrations.filter((r) =>
        r.eventLabel.startsWith('E125 Identity Leaders Roundtable SYD'),
      )
      expect(e125Rows.length).toBeGreaterThan(0)
      expect(e125Rows.every((r) => r.eventId === 'E125')).toBe(true)
    })

    it('groups matching rows under E125 and counts by status', () => {
      const result = reconcile(events, registrations)
      const e125 = summaryFor(result.summaries, 'E125')
      expect(e125.source).toBe('live')
      expect(e125.breakdown).toEqual({ Accepted: 36, Pending: 4, Cancelled: 4 })
      expect(e125.confirmed).toBe(36)
    })

    it('matches every live row to a scheduled event', () => {
      expect(reconcile(events, registrations).unmatchedRows).toEqual([])
    })
  })

  describe('Scenario: Filter out duplicate double-submissions by default', () => {
    const isArjunOnE101 = (r: { firstName: string; lastName: string; eventId: string | null }) =>
      r.firstName === 'Arjun' && r.lastName === 'Nguyen' && r.eventId === 'E101'

    it('has two Arjun Nguyen rows on E101 sharing mobile and timestamp', () => {
      const rows = registrations.filter(isArjunOnE101)
      expect(rows).toHaveLength(2)
      expect(new Set(rows.map((r) => r.mobile))).toEqual(new Set(['0483930103']))
      expect(new Set(rows.map((r) => r.registeredAt))).toEqual(
        new Set(['2026-10-11T09:32:00+11:00']),
      )
    })

    it('counts only 1 registration and increments the duplicate counter by 1', () => {
      const arjunOnly = registrations.filter(isArjunOnE101)
      const result = reconcile(events, arjunOnly)
      const e101 = summaryFor(result.summaries, 'E101')
      expect(e101.breakdown).toEqual({ Accepted: 1, Pending: 0, Cancelled: 0 })
      expect(result.duplicateCount).toBe(1)

      const withoutDedupe = reconcile(events, arjunOnly, { deduplicate: false })
      expect(result.duplicateCount - withoutDedupe.duplicateCount).toBe(1)
    })

    it('filters all 10 double-submissions in the full export', () => {
      expect(reconcile(events, registrations).duplicateCount).toBe(10)
    })
  })

  describe('Scenario: Preserve distinct registrations for people with the same name', () => {
    it('keeps both Daniel Khan rows R1072 and R1082 for E101', () => {
      const danielRows = registrations.filter(
        (r) => r.firstName === 'Daniel' && r.lastName === 'Khan' && r.eventId === 'E101',
      )
      expect(danielRows.map((r) => r.registrationId).sort()).toEqual(['R1072', 'R1082'])

      const result = reconcile(events, danielRows)
      expect(result.duplicateCount).toBe(0)
      expect(summaryFor(result.summaries, 'E101').breakdown?.Accepted).toBe(2)
    })
  })

  describe('Scenario: Fall back to nightly snapshot when an event is absent from the live CSV', () => {
    it('uses 9 of 30 for E126 with no status breakdown', () => {
      expect(registrations.some((r) => r.eventId === 'E126')).toBe(false)
      const e126 = summaryFor(reconcile(events, registrations).summaries, 'E126')
      expect(e126).toMatchObject({
        source: 'snapshot',
        confirmed: 9,
        target: 30,
        breakdown: null,
      })
      expect(e126.event).toMatchObject({ name: 'Identity Leaders Roundtable', city: 'Melbourne' })
    })
  })

  describe('Scenario: Handle null registration counts safely', () => {
    it('defaults E155 to 0 of 25 (0%) with no data', () => {
      expect(registrations.some((r) => r.eventId === 'E155')).toBe(false)
      const e155 = summaryFor(reconcile(events, registrations).summaries, 'E155')
      expect(e155).toMatchObject({
        source: 'none',
        confirmed: 0,
        target: 25,
        percent: 0,
        breakdown: null,
      })
    })
  })
})
