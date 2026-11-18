import type {
  EventRecord,
  EventSummary,
  ReconciliationResult,
  Registration,
  StatusCounts,
} from '../types'
import { deduplicate, type DedupeResult } from './dedupe'

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

type ProgressFields = Pick<EventSummary, 'source' | 'confirmed' | 'breakdown'>

function buildSummary(
  event: EventRecord,
  fields: ProgressFields,
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
 * Picks the progress source. Live CSV rows take precedence; when an event has no
 * live rows we fall back to the nightly snapshot, which has no status breakdown.
 */
function resolveProgress(event: EventRecord, liveRows: readonly Registration[]): ProgressFields {
  if (liveRows.length > 0) {
    const breakdown = countByStatus(liveRows)
    return { source: 'live', confirmed: breakdown.Accepted, breakdown }
  }
  if (event.current_registrations !== null) {
    return { source: 'snapshot', confirmed: event.current_registrations, breakdown: null }
  }
  return { source: 'none', confirmed: 0, breakdown: null }
}

/** Summarizes one event from its live rows, falling back to the nightly snapshot. */
export function summarizeEvent(
  event: EventRecord,
  liveRows: readonly Registration[],
  duplicatesFiltered = 0,
): EventSummary {
  return buildSummary(event, resolveProgress(event, liveRows), duplicatesFiltered)
}

/** Groups registrations by their extracted event ID. Rows without an ID are skipped. */
export function groupByEventId(
  registrations: readonly Registration[],
): Map<string, Registration[]> {
  const groups = new Map<string, Registration[]>()
  for (const registration of registrations) addToGroup(groups, registration)
  return groups
}

function addToGroup(groups: Map<string, Registration[]>, registration: Registration): void {
  const { eventId } = registration
  if (!eventId) return
  const group = groups.get(eventId) ?? []
  group.push(registration)
  groups.set(eventId, group)
}

/** Combines the master schedule with the live export into one summary per scheduled event. */
export function reconcile(
  events: readonly EventRecord[],
  registrations: readonly Registration[],
  options: ReconcileOptions = {},
): ReconciliationResult {
  const { kept, duplicates } = applyDedupe(registrations, options.deduplicate ?? true)

  const liveByEvent = groupByEventId(kept)
  const duplicatesByEvent = groupByEventId(duplicates)
  const knownIds = new Set(events.map((event) => event.event_id))

  const summaries = events.map((event) =>
    summarizeEvent(
      event,
      rowsFor(liveByEvent, event.event_id),
      rowsFor(duplicatesByEvent, event.event_id).length,
    ),
  )
  const unmatchedRows = kept.filter((registration) => !isScheduled(registration, knownIds))

  return { summaries, duplicateCount: duplicates.length, unmatchedRows }
}

/** Rows grouped under `eventId`, or an empty list when the event has none. */
function rowsFor(groups: ReadonlyMap<string, Registration[]>, eventId: string): Registration[] {
  return groups.get(eventId) ?? []
}

function applyDedupe(registrations: readonly Registration[], active: boolean): DedupeResult {
  return active ? deduplicate(registrations) : { kept: [...registrations], duplicates: [] }
}

/** True when the row's extracted event ID exists in the master schedule. */
function isScheduled(registration: Registration, knownIds: ReadonlySet<string>): boolean {
  return registration.eventId !== null && knownIds.has(registration.eventId)
}
