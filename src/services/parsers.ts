import type { EventRecord, Registration } from '../types'
import { parseCsvRecords } from './csv'
import { extractEventId, normalizeStatus } from './normalize'

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Returns a finite number, or `null` for null/missing/non-numeric values. */
export function toNullableCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function toEventRecord(raw: UnknownRecord): EventRecord {
  return {
    event_id: asString(raw.event_id).trim().toUpperCase(),
    name: asString(raw.name),
    city: asString(raw.city),
    date: asString(raw.date),
    type: asString(raw.type),
    target_registrations: toNullableCount(raw.target_registrations) ?? 0,
    current_registrations: toNullableCount(raw.current_registrations),
    launched: asString(raw.launched),
  }
}

/** Validates and normalizes the parsed `events.json` payload. Entries without an event ID are dropped. */
export function parseEvents(data: unknown): EventRecord[] {
  if (!Array.isArray(data)) {
    throw new Error('Event schedule must be a JSON array')
  }
  return data
    .filter(isRecord)
    .map(toEventRecord)
    .filter((event) => event.event_id !== '')
}

/** Reads a CSV cell by column name, trimmed; missing columns become "". */
function cell(row: Record<string, string>, column: string): string {
  return (row[column] ?? '').trim()
}

export function toRegistration(row: Record<string, string>): Registration {
  const eventLabel = cell(row, 'event')
  return {
    registrationId: cell(row, 'registration_id'),
    eventId: extractEventId(eventLabel),
    eventLabel,
    firstName: cell(row, 'first_name'),
    lastName: cell(row, 'last_name'),
    email: cell(row, 'email'),
    mobile: cell(row, 'mobile'),
    registeredAt: cell(row, 'registered_at'),
    status: normalizeStatus(cell(row, 'status')),
  }
}

/** Parses the live registration CSV export. */
export function parseRegistrations(csvText: string): Registration[] {
  return parseCsvRecords(csvText).map(toRegistration)
}
