import type { EventSummary } from '../types'

export type AttentionBadge =
  | 'Needs Attention (Urgent)'
  | 'Needs Attention (Behind)'
  | 'Target Met'
  | 'On Track'
  | 'Completed'

export interface AttentionResult {
  daysRemaining: number
  percent: number
  badge: AttentionBadge
  needsAttention: boolean
}

export const URGENT_WINDOW_DAYS = 3
export const URGENT_BELOW_PERCENT = 70
export const BEHIND_WINDOW_DAYS = 7

const MS_PER_DAY = 86_400_000

/** Parses the date part of an ISO string as a UTC day number. */
function dayNumber(iso: string): number {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
  return Date.UTC(year, month - 1, day) / MS_PER_DAY
}

/** Whole calendar days from `today` to `eventDate` (negative when in the past). */
export function daysBetween(today: string, eventDate: string): number {
  return Math.round(dayNumber(eventDate) - dayNumber(today))
}

function classify(daysRemaining: number, percent: number): AttentionBadge {
  if (daysRemaining < 0) return 'Completed'
  if (percent >= 100) return 'Target Met'
  if (daysRemaining <= URGENT_WINDOW_DAYS && percent < URGENT_BELOW_PERCENT) {
    return 'Needs Attention (Urgent)'
  }
  if (daysRemaining <= BEHIND_WINDOW_DAYS) return 'Needs Attention (Behind)'
  return 'On Track'
}

/** Evaluates urgency for an event relative to the reference date (YYYY-MM-DD). */
export function evaluateAttention(
  eventDate: string,
  confirmed: number,
  target: number,
  today: string,
): AttentionResult {
  const daysRemaining = daysBetween(today, eventDate)
  const percent = target > 0 ? Math.round((confirmed / target) * 100) : 0
  const badge = classify(daysRemaining, percent)
  return { daysRemaining, percent, badge, needsAttention: badge.startsWith('Needs Attention') }
}

export interface PrioritizedEvent {
  summary: EventSummary
  attention: AttentionResult
}

function rank(item: PrioritizedEvent): number {
  if (item.attention.badge === 'Needs Attention (Urgent)') return 0
  return item.attention.needsAttention ? 1 : 2
}

/** Sorts events so those needing attention come first (urgent, then behind, soonest first). */
export function prioritize(summaries: readonly EventSummary[], today: string): PrioritizedEvent[] {
  return summaries
    .map((summary) => ({
      summary,
      attention: evaluateAttention(summary.event.date, summary.confirmed, summary.target, today),
    }))
    .sort((a, b) => rank(a) - rank(b) || a.summary.event.date.localeCompare(b.summary.event.date))
}

export function todayIso(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
