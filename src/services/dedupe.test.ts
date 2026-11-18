import { describe, expect, it } from 'vitest'
import { makeRegistration } from '../test/fixtures'
import { deduplicate, duplicateKey } from './dedupe'

describe('duplicateKey', () => {
  it('matches the same submission despite name casing, whitespace, email and mobile format', () => {
    const original = makeRegistration({
      firstName: 'Sarah',
      lastName: 'Smith',
      email: 'sarah.smith@summitretail.example',
      mobile: '0431003309',
      registeredAt: '2026-10-05T15:42:00+11:00',
    })
    const resubmission = makeRegistration({
      firstName: '  SARAH ',
      lastName: 'smith',
      email: 'SARAH.SMITH@SUMMITRETAIL.EXAMPLE',
      mobile: '+61 431 003 309',
      registeredAt: '2026-10-05T15:42:00+11:00',
    })
    expect(duplicateKey(resubmission)).toBe(duplicateKey(original))
  })

  it.each([
    ['event', { eventId: 'E125' }],
    ['first name', { firstName: 'Other' }],
    ['last name', { lastName: 'Other' }],
    ['mobile', { mobile: '0499999999' }],
    ['timestamp', { registeredAt: '2026-10-01T09:01:00+11:00' }],
  ])('differs when the %s differs', (_field, overrides) => {
    expect(duplicateKey(makeRegistration(overrides))).not.toBe(duplicateKey(makeRegistration()))
  })

  it('falls back to the raw label when no event ID was extracted', () => {
    const a = makeRegistration({ eventId: null, eventLabel: 'Mystery event A' })
    const b = makeRegistration({ eventId: null, eventLabel: 'Mystery event B' })
    expect(duplicateKey(a)).not.toBe(duplicateKey(b))
  })
})

describe('deduplicate', () => {
  it('keeps the first occurrence and reports later ones as duplicates', () => {
    const first = makeRegistration({ registrationId: 'R1012' })
    const second = makeRegistration({ registrationId: 'R1312', email: 'other@gmail.com' })
    const other = makeRegistration({ registrationId: 'R2000', mobile: '0411111111' })

    const result = deduplicate([first, second, other])

    expect(result.kept.map((r) => r.registrationId)).toEqual(['R1012', 'R2000'])
    expect(result.duplicates.map((r) => r.registrationId)).toEqual(['R1312'])
  })

  it('returns empty results for empty input', () => {
    expect(deduplicate([])).toEqual({ kept: [], duplicates: [] })
  })
})
