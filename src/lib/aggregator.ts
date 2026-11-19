import type { EventRecord, EventSummary, Registration } from '../types'
import { evaluateAttention } from '../services/attention'
import { reconcile } from '../services/reconcile'

export { reconcile } from '../services/reconcile'
export { deduplicate } from '../services/dedupe'
export { evaluateAttention, daysBetween, todayIso } from '../services/attention'

/** Events this many days out (inclusive) or fewer are considered by the digest. */
export const DIGEST_WINDOW_DAYS = 10
/** Events under this percentage of target are "behind". */
export const DIGEST_BEHIND_BELOW_PERCENT = 85

export interface BehindTargetEvent {
  eventId: string
  name: string
  city: string
  daysUntil: number
  confirmed: number
  target: number
  percent: number
  pending: number
}

function toBehindEvent(summary: EventSummary, daysUntil: number, percent: number): BehindTargetEvent {
  return {
    eventId: summary.event.event_id,
    name: summary.event.name,
    city: summary.event.city,
    daysUntil,
    confirmed: summary.confirmed,
    target: summary.target,
    percent,
    pending: summary.breakdown?.Pending ?? 0,
  }
}

function isBehind(daysUntil: number, percent: number): boolean {
  return (
    daysUntil >= 0 && daysUntil <= DIGEST_WINDOW_DAYS && percent < DIGEST_BEHIND_BELOW_PERCENT
  )
}

/** Upcoming events within the window and under the target threshold, soonest first. */
export function findBehindTargetEvents(
  summaries: readonly EventSummary[],
  today: string,
): BehindTargetEvent[] {
  const behind: BehindTargetEvent[] = []
  for (const summary of summaries) {
    const { daysRemaining, percent } = evaluateAttention(
      summary.event.date,
      summary.confirmed,
      summary.target,
      today,
    )
    if (isBehind(daysRemaining, percent)) behind.push(toBehindEvent(summary, daysRemaining, percent))
  }
  return behind.sort((a, b) => a.daysUntil - b.daysUntil || a.eventId.localeCompare(b.eventId))
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

export function formatDigestLine(event: BehindTargetEvent): string {
  const pending = event.pending > 0 ? ` | ${event.pending} pending` : ''
  return (
    `• ${event.eventId} ${event.name} (${event.city}) | ` +
    `${plural(event.daysUntil, 'day')} to go | ` +
    `${event.confirmed}/${event.target} confirmed (${event.percent}%)${pending}`
  )
}

export const ALL_CLEAR_TEXT =
  '✅ Good morning! All upcoming events in the next 10 days are currently on track.'

/** Builds the human-readable Slack message text. */
export function formatDigestText(events: readonly BehindTargetEvent[]): string {
  if (events.length === 0) return ALL_CLEAR_TEXT
  const header = `🚨 Good morning! ${plural(events.length, 'event')} behind target need outreach or approval follow-up:`
  return [header, ...events.map(formatDigestLine)].join('\n')
}

/** Reconciles (with deduplication) and builds the digest message for a reference date. */
export function buildDigestText(
  events: readonly EventRecord[],
  registrations: readonly Registration[],
  today: string,
): string {
  const { summaries } = reconcile(events, registrations, { deduplicate: true })
  return formatDigestText(findBehindTargetEvents(summaries, today))
}
