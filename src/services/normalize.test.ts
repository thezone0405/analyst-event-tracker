import { describe, expect, it } from 'vitest'
import {
  extractEventId,
  normalizeMobile,
  normalizeName,
  normalizeStatus,
  normalizeTimestamp,
} from './normalize'

describe('extractEventId', () => {
  it('extracts the leading event ID from a label', () => {
    expect(extractEventId('E125 Identity Leaders Roundtable SYD')).toBe('E125')
  })

  it('upper-cases and tolerates leading whitespace', () => {
    expect(extractEventId('  e101 Sydney Cloud Security Summit')).toBe('E101')
  })

  it('returns null when there is no leading ID', () => {
    expect(extractEventId('Identity Leaders Roundtable E125')).toBeNull()
    expect(extractEventId('')).toBeNull()
  })

  it('does not match an ID that runs into other characters', () => {
    expect(extractEventId('E125X Roundtable')).toBeNull()
  })
})

describe('normalizeName', () => {
  it('trims, collapses whitespace and lower-cases', () => {
    expect(normalizeName('  DANIEL ')).toBe('daniel')
    expect(normalizeName('Mary   Ann')).toBe('mary ann')
  })
})

describe('normalizeMobile', () => {
  it('keeps a 10-digit national number', () => {
    expect(normalizeMobile('0483930103')).toBe('0483930103')
  })

  it('converts +61 international format', () => {
    expect(normalizeMobile('+61 427 874 296')).toBe('0427874296')
  })

  it('restores a dropped leading zero', () => {
    expect(normalizeMobile('458414384')).toBe('0458414384')
  })

  it('leaves other digit strings unchanged', () => {
    expect(normalizeMobile('123456789')).toBe('123456789')
    expect(normalizeMobile('61123')).toBe('61123')
    expect(normalizeMobile('')).toBe('')
  })
})

describe('normalizeTimestamp', () => {
  it('canonicalises equivalent instants', () => {
    expect(normalizeTimestamp('2026-10-11T09:32:00+11:00')).toBe(
      normalizeTimestamp('2026-10-10T22:32:00Z'),
    )
    expect(normalizeTimestamp(' 2026-10-11T09:32:00+11:00 ')).toBe('2026-10-10T22:32:00.000Z')
  })

  it('falls back to the trimmed raw value when unparseable', () => {
    expect(normalizeTimestamp('  not a date ')).toBe('not a date')
  })
})

describe('normalizeStatus', () => {
  it('maps statuses case-insensitively', () => {
    expect(normalizeStatus('Accepted')).toBe('Accepted')
    expect(normalizeStatus(' pending ')).toBe('Pending')
    expect(normalizeStatus('CANCELLED')).toBe('Cancelled')
  })

  it('returns null for unknown statuses', () => {
    expect(normalizeStatus('Waitlisted')).toBeNull()
    expect(normalizeStatus('')).toBeNull()
  })
})
