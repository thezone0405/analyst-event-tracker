import { describe, expect, it } from 'vitest'
import { makeEvent } from '../test/fixtures'
import { summarizeEvent } from './reconcile'
import { daysBetween, evaluateAttention, prioritize, todayIso } from './attention'

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

describe('daysBetween / todayIso', () => {
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
})
