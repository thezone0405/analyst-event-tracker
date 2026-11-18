export type RegistrationStatus = 'Accepted' | 'Pending' | 'Cancelled'

export const REGISTRATION_STATUSES: readonly RegistrationStatus[] = [
  'Accepted',
  'Pending',
  'Cancelled',
]

/** One row of the nightly master schedule (`events.json`). */
export interface EventRecord {
  event_id: string
  name: string
  city: string
  date: string
  type: string
  target_registrations: number
  current_registrations: number | null
  launched: string
}

/** One parsed row of the live registration export (`registrations.csv`). */
export interface Registration {
  registrationId: string
  /** Leading event ID extracted from the event label, e.g. "E125". */
  eventId: string | null
  eventLabel: string
  firstName: string
  lastName: string
  email: string
  mobile: string
  registeredAt: string
  status: RegistrationStatus | null
}

export type StatusCounts = Record<RegistrationStatus, number>

/**
 * Where an event's progress count came from:
 * - `live`: counted from the live CSV export
 * - `snapshot`: fell back to the nightly `current_registrations` figure
 * - `none`: no live rows and no snapshot figure
 */
export type SummarySource = 'live' | 'snapshot' | 'none'

export interface EventSummary {
  event: EventRecord
  source: SummarySource
  /** Confirmed progress count (Accepted rows for live data, snapshot otherwise). */
  confirmed: number
  target: number
  percent: number
  /** Per-status counts; `null` when the source cannot provide a breakdown. */
  breakdown: StatusCounts | null
  /** Duplicate submissions filtered out of this event's live rows. */
  duplicatesFiltered: number
}

export interface ReconciliationResult {
  summaries: EventSummary[]
  /** Total duplicate submissions filtered across all events. */
  duplicateCount: number
  /** Live rows whose event ID is missing or not in the master schedule. */
  unmatchedRows: Registration[]
}
