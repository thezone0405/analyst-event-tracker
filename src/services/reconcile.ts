import type {
  EventRecord,
  EventSummary,
  ReconciliationResult,
  Registration,
  StatusCounts,
} from '../types'
import { deduplicate } from './dedupe'

export interface ReconcileOptions {
  /** Filter duplicate double-submissions (default: true). */
  deduplicate?: boolean
}

export function emptyStatusCounts(): StatusCounts {
  return { Accepted: 0, Pending: 0, Cancelled: 0 }
}

/** Counts registrations per status; rows with an unrecognised status are not counted. */
export function countByStatus(registrations: readonly Registration[]): StatusCounts {
  const counts = emptyStatusCounts()
  for (const registration of registrations) {
    if (registration.status) counts[registration.status] += 1
  }
  return counts
}

/** Whole-number percentage of `count` against `target`; 0 when the target is not positive. */
export function percentOf(count: number, target: number): number {
  if (target <= 0) return 0
  return Math.round((count / target) * 100)
}

function buildSummary(
  event: EventRecord,
  fields: Pick<EventSummary, 'source' | 'confirmed' | 'breakdown'>,
  duplicatesFiltered: number,
): EventSummary {
  const target = Math.max(0, event.target_registrations)
  return {
    event,
    target,
    percent: percentOf(fields.confirmed, target),
    duplicatesFiltered,
    ...fields,
  }
}

/**
 * Summarizes one event. Live CSV rows take precedence; when an event has no
 * live rows we fall back to the nightly snapshot, which has no status breakdown.
 */
export function summarizeEvent(
  event: EventRecord,
  liveRows: readonly Registration[],
  duplicatesFiltered = 0,
): EventSummary {
  if (liveRows.length > 0) {
    const breakdown = countByStatus(liveRows)
    return buildSummary(
      event,
      { source: 'live', confirmed: breakdown.Accepted, breakdown },
      duplicatesFiltered,
    )
  }
  if (event.current_registrations !== null) {
    return buildSummary(
      event,
      { source: 'snapshot', confirmed: event.current_registrations, breakdown: null },
      duplicatesFiltered,
    )
  }
  return buildSummary(event, { source: 'none', confirmed: 0, breakdown: null }, duplicatesFiltered)
}

/** Groups registrations by their extracted event ID. Rows without an ID are skipped. */
export function groupByEventId(
  registrations: readonly Registration[],
): Map<string, Registration[]> {
  const groups = new Map<string, Registration[]>()
  for (const registration of registrations) {
    if (!registration.eventId) continue
    const group = groups.get(registration.eventId) ?? []
    group.push(registration)
    groups.set(registration.eventId, group)
  }
  return groups
}

/** Combines the master schedule with the live export into one summary per scheduled event. */
export function reconcile(
  events: readonly EventRecord[],
  registrations: readonly Registration[],
  options: ReconcileOptions = {},
): ReconciliationResult {
  const shouldDedupe = options.deduplicate ?? true
  const { kept, duplicates } = shouldDedupe
    ? deduplicate(registrations)
    : { kept: [...registrations], duplicates: [] }

  const liveByEvent = groupByEventId(kept)
  const duplicatesByEvent = groupByEventId(duplicates)
  const knownIds = new Set(events.map((event) => event.event_id))

  const summaries = events.map((event) =>
    summarizeEvent(
      event,
      liveByEvent.get(event.event_id) ?? [],
      duplicatesByEvent.get(event.event_id)?.length ?? 0,
    ),
  )
  const unmatchedRows = kept.filter(
    (registration) => !registration.eventId || !knownIds.has(registration.eventId),
  )

  return { summaries, duplicateCount: duplicates.length, unmatchedRows }
}
