import type { Registration } from '../types'
import { normalizeMobile, normalizeName, normalizeTimestamp } from './normalize'

/**
 * Identity of a submission for duplicate detection. Two rows are the same
 * double-submission only when event, name, normalized mobile and timestamp all
 * match — so different people sharing a name are kept apart. Email is ignored
 * because duplicate submissions often use a different address.
 */
export function duplicateKey(registration: Registration): string {
  return [
    registration.eventId ?? registration.eventLabel,
    normalizeName(registration.firstName),
    normalizeName(registration.lastName),
    normalizeMobile(registration.mobile),
    normalizeTimestamp(registration.registeredAt),
  ].join('|')
}

export interface DedupeResult {
  kept: Registration[]
  duplicates: Registration[]
}

/** Keeps the first occurrence of each submission and reports the rest as duplicates. */
export function deduplicate(registrations: readonly Registration[]): DedupeResult {
  const seen = new Set<string>()
  const kept: Registration[] = []
  const duplicates: Registration[] = []
  for (const registration of registrations) {
    const key = duplicateKey(registration)
    if (seen.has(key)) {
      duplicates.push(registration)
    } else {
      seen.add(key)
      kept.push(registration)
    }
  }
  return { kept, duplicates }
}
