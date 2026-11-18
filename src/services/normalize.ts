import { REGISTRATION_STATUSES, type RegistrationStatus } from '../types'

const EVENT_ID_PATTERN = /^\s*(E\d+)\b/i

/** Extracts the leading event ID from a label like "E125 Identity Leaders Roundtable SYD". */
export function extractEventId(label: string): string | null {
  const match = EVENT_ID_PATTERN.exec(label)
  return match ? match[1].toUpperCase() : null
}

/** Trims, collapses internal whitespace and lower-cases a name for comparison. */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Normalizes Australian mobile numbers to the 10-digit national form,
 * e.g. "+61 427 874 296" and "427874296" both become "0427874296".
 */
export function normalizeMobile(mobile: string): string {
  const digits = mobile.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('61')) {
    return `0${digits.slice(2)}`
  }
  if (digits.length === 9 && digits.startsWith('4')) {
    return `0${digits}`
  }
  return digits
}

/** Converts a timestamp to a canonical UTC ISO string; falls back to the trimmed raw value. */
export function normalizeTimestamp(value: string): string {
  const trimmed = value.trim()
  const millis = Date.parse(trimmed)
  return Number.isNaN(millis) ? trimmed : new Date(millis).toISOString()
}

/** Case-insensitively maps a raw status to a known status, or `null` if unrecognised. */
export function normalizeStatus(value: string): RegistrationStatus | null {
  const lower = value.trim().toLowerCase()
  return REGISTRATION_STATUSES.find((status) => status.toLowerCase() === lower) ?? null
}
