import { describe, expect, it } from 'vitest'
import { makeEvent } from '../test/fixtures'
import { summarizeEvent } from './reconcile'
import {
  BEHIND_WINDOW_DAYS,
  URGENT_BELOW_PERCENT,
  URGENT_WINDOW_DAYS,
  daysBetween,
  evaluateAttention,
  prioritize,
  todayIso,
} from './attention'

const TODAY = '2026-11-16'

describe('evaluateAttention', () => {
  it.each([
    ['E130', '2026-11-19', 25, 4, 16, 'Needs Attention (Urgent)', true],
    ['E126', '2026-11-19', 30, 9, 30, 'Needs Attention (Urgent)', true],
    ['E101', '2026-11-19', 60, 36, 60, 'Needs Attention (Urgent)', true],
    ['E125', '2026-11-18', 50, 36, 72, 'Needs Attention (Behind)', true],
    ['E141', '2026-11-26', 30, 31, 103, 'Target Met', false],
    ['E150', '2027-02-24', 300, 40, 13, 'On Track', false],
    ['E114', '2026-11-10', 45, 42, 93, 'Completed', false],
  ] as const)('%s', (_id, date, target, confirmed, pct, badge, flag) => {
    const result = evaluateAttention(date, confirmed, target, TODAY)
    expect(result.percent).toBe(pct)
    expect(result.badge).toBe(badge)
    expect(result.needsAttention).toBe(flag)
  })

  it('handles a zero target', () => {
    expect(evaluateAttention('2027-01-01', 0, 0, TODAY).percent).toBe(0)
  })
})

describe('evaluateAttention boundaries', () => {
  const badge = (date: string, confirmed: number, target = 100) =>
    evaluateAttention(date, confirmed, target, TODAY).badge

  it('exposes the rule thresholds', () => {
    expect(URGENT_WINDOW_DAYS).toBe(3)
    expect(URGENT_BELOW_PERCENT).toBe(70)
    expect(BEHIND_WINDOW_DAYS).toBe(7)
  })

  it('treats an event happening today as upcoming, yesterday as completed', () => {
    expect(badge('2026-11-16', 10)).toBe('Needs Attention (Urgent)')
    expect(evaluateAttention('2026-11-16', 10, 100, TODAY).daysRemaining).toBe(0)
    expect(badge('2026-11-15', 10)).toBe('Completed')
    expect(evaluateAttention('2026-11-15', 10, 100, TODAY).daysRemaining).toBe(-1)
  })

  it('completed wins over target met and is never flagged', () => {
    const result = evaluateAttention('2026-11-15', 150, 100, TODAY)
    expect(result.badge).toBe('Completed')
    expect(result.needsAttention).toBe(false)
  })

  it('switches to Target Met at exactly 100% and not at 99%', () => {
    expect(badge('2026-11-17', 100)).toBe('Target Met')
    expect(badge('2026-11-17', 99)).toBe('Needs Attention (Behind)')
    expect(badge('2026-11-17', 101)).toBe('Target Met')
  })

  it('target met applies even with an urgent window', () => {
    expect(evaluateAttention('2026-11-16', 100, 100, TODAY).needsAttention).toBe(false)
  })

  it('urgent window includes 3 days and excludes 4 days', () => {
    expect(badge('2026-11-19', 50)).toBe('Needs Attention (Urgent)')
    expect(badge('2026-11-20', 50)).toBe('Needs Attention (Behind)')
  })

  it('urgent requires strictly below 70%', () => {
    expect(badge('2026-11-19', 69)).toBe('Needs Attention (Urgent)')
    expect(badge('2026-11-19', 70)).toBe('Needs Attention (Behind)')
    expect(badge('2026-11-19', 71)).toBe('Needs Attention (Behind)')
  })

  it('behind window includes 7 days and excludes 8 days', () => {
    expect(badge('2026-11-23', 50)).toBe('Needs Attention (Behind)')
    expect(badge('2026-11-24', 50)).toBe('On Track')
    expect(evaluateAttention('2026-11-23', 50, 100, TODAY).needsAttention).toBe(true)
    expect(evaluateAttention('2026-11-24', 50, 100, TODAY).needsAttention).toBe(false)
  })

  it('rounds the percentage to the nearest integer', () => {
    expect(evaluateAttention('2027-01-01', 1, 3, TODAY).percent).toBe(33)
    expect(evaluateAttention('2027-01-01', 2, 3, TODAY).percent).toBe(67)
    expect(evaluateAttention('2027-01-01', 1, 8, TODAY).percent).toBe(13)
    expect(evaluateAttention('2027-01-01', 3, 8, TODAY).percent).toBe(38)
  })

  it('reports 0% for zero or negative targets regardless of confirmed count', () => {
    expect(evaluateAttention('2027-01-01', 5, 0, TODAY).percent).toBe(0)
    expect(evaluateAttention('2027-01-01', 5, -10, TODAY).percent).toBe(0)
    expect(evaluateAttention('2027-01-01', 0, 1, TODAY).percent).toBe(0)
    expect(evaluateAttention('2027-01-01', 1, 1, TODAY).percent).toBe(100)
  })
})

describe('daysBetween / todayIso', () => {
  it('handles month, year and leap-day boundaries', () => {
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1)
    expect(daysBetween('2026-01-31', '2026-02-01')).toBe(1)
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2)
    expect(daysBetween('2026-11-16', '2026-11-16')).toBe(0)
    expect(daysBetween('2026-11-16', '2027-11-16')).toBe(365)
  })
  it('uses only the date part of ISO timestamps', () => {
    expect(daysBetween('2026-11-16T23:59:59Z', '2026-11-17T00:00:00Z')).toBe(1)
    expect(daysBetween('2026-11-16T00:00:00Z', '2026-11-16T23:59:59Z')).toBe(0)
  })
  it('zero-pads month and day and uses 1-based months', () => {
    expect(todayIso(new Date(2026, 10, 25))).toBe('2026-11-25')
    expect(todayIso(new Date(2026, 11, 31))).toBe('2026-12-31')
    expect(todayIso(new Date(2026, 8, 9))).toBe('2026-09-09')
  })
  it('counts calendar days', () => {
    expect(daysBetween('2026-11-16', '2026-11-19')).toBe(3)
    expect(daysBetween('2026-11-16', '2026-11-10')).toBe(-6)
  })
  it('formats local date', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('prioritize', () => {
  it('puts urgent first and keeps completed events out of attention', () => {
    const mk = (id: string, date: string, target: number, n: number) =>
      summarizeEvent(
        makeEvent({ event_id: id, date, target_registrations: target, current_registrations: n }),
        [],
      )
    const list = prioritize(
      [
        mk('E150', '2027-02-24', 300, 40),
        mk('E114', '2026-11-10', 45, 42),
        mk('E125', '2026-11-18', 50, 36),
        mk('E130', '2026-11-19', 25, 4),
      ],
      TODAY,
    )
    expect(list.map((i) => i.summary.event.event_id)).toEqual(['E130', 'E125', 'E114', 'E150'])
    expect(list.filter((i) => i.attention.needsAttention)).toHaveLength(2)
  })

  const mk = (id: string, date: string, target: number, n: number) =>
    summarizeEvent(
      makeEvent({ event_id: id, date, target_registrations: target, current_registrations: n }),
      [],
    )
  const ids = (list: ReturnType<typeof prioritize>) => list.map((i) => i.summary.event.event_id)

  it('ranks urgent before behind even when the behind event is sooner', () => {
    const list = prioritize(
      [mk('BEHIND', '2026-11-17', 100, 80), mk('URGENT', '2026-11-19', 100, 10)],
      TODAY,
    )
    expect(ids(list)).toEqual(['URGENT', 'BEHIND'])
  })

  it('ranks behind before target met, completed and on-track events with earlier dates', () => {
    const list = prioritize(
      [
        mk('MET', '2026-11-17', 100, 100),
        mk('DONE', '2026-11-10', 100, 100),
        mk('TRACK', '2026-12-30', 100, 10),
        mk('BEHIND', '2026-11-22', 100, 80),
      ],
      TODAY,
    )
    expect(ids(list)[0]).toBe('BEHIND')
    expect(ids(list)).toEqual(['BEHIND', 'DONE', 'MET', 'TRACK'])
  })

  it('orders events of the same rank by date ascending', () => {
    const urgent = prioritize(
      [mk('U2', '2026-11-19', 100, 10), mk('U1', '2026-11-17', 100, 10)],
      TODAY,
    )
    expect(ids(urgent)).toEqual(['U1', 'U2'])
    const behind = prioritize(
      [mk('B2', '2026-11-22', 100, 80), mk('B1', '2026-11-21', 100, 80)],
      TODAY,
    )
    expect(ids(behind)).toEqual(['B1', 'B2'])
  })

  it('attaches the evaluated attention result to each summary', () => {
    const [item] = prioritize([mk('E130', '2026-11-19', 25, 4)], TODAY)
    expect(item.attention).toEqual({
      daysRemaining: 3,
      percent: 16,
      badge: 'Needs Attention (Urgent)',
      needsAttention: true,
    })
  })

  it('returns an empty list for no events and does not mutate its input', () => {
    expect(prioritize([], TODAY)).toEqual([])
    const input = [mk('B', '2026-11-22', 100, 80), mk('A', '2026-11-17', 100, 10)]
    prioritize(input, TODAY)
    expect(input.map((s) => s.event.event_id)).toEqual(['B', 'A'])
  })
})
