import { describe, expect, it } from 'vitest'
import { parseEvents, parseRegistrations, toNullableCount, toRegistration } from './parsers'

describe('toNullableCount', () => {
  it('accepts finite numbers only', () => {
    expect(toNullableCount(9)).toBe(9)
    expect(toNullableCount(0)).toBe(0)
    expect(toNullableCount(null)).toBeNull()
    expect(toNullableCount(undefined)).toBeNull()
    expect(toNullableCount('9')).toBeNull()
    expect(toNullableCount(Number.NaN)).toBeNull()
  })
})

describe('parseEvents', () => {
  it('normalizes event records and preserves null current_registrations', () => {
    const [event] = parseEvents([
      {
        event_id: ' e155 ',
        name: 'Data Governance Roundtable',
        city: 'Auckland',
        date: '2026-11-12',
        type: 'Roundtable',
        target_registrations: 25,
        current_registrations: null,
        launched: '2026-10-10',
      },
    ])
    expect(event).toEqual({
      event_id: 'E155',
      name: 'Data Governance Roundtable',
      city: 'Auckland',
      date: '2026-11-12',
      type: 'Roundtable',
      target_registrations: 25,
      current_registrations: null,
      launched: '2026-10-10',
    })
  })

  it('defaults missing fields safely', () => {
    expect(parseEvents([{ event_id: 'E1' }])).toEqual([
      {
        event_id: 'E1',
        name: '',
        city: '',
        date: '',
        type: '',
        target_registrations: 0,
        current_registrations: null,
        launched: '',
      },
    ])
  })

  it('drops non-object entries and entries without an ID', () => {
    expect(parseEvents([null, 'E1', [], { name: 'no id' }, { event_id: 'E2' }])).toHaveLength(1)
  })

  it('throws when the payload is not an array', () => {
    expect(() => parseEvents({ events: [] })).toThrow('Event schedule must be a JSON array')
  })
})

describe('toRegistration', () => {
  it('maps and trims CSV columns', () => {
    expect(
      toRegistration({
        registration_id: 'R1076',
        event: 'E114 Platform Engineering Dinner MEL',
        first_name: '  DANIEL ',
        last_name: 'Murphy',
        email: 'daniel.murphy@harbourins.example',
        mobile: '0413826758',
        registered_at: '2026-10-24T19:09:00+11:00',
        status: 'Accepted',
      }),
    ).toEqual({
      registrationId: 'R1076',
      eventId: 'E114',
      eventLabel: 'E114 Platform Engineering Dinner MEL',
      firstName: 'DANIEL',
      lastName: 'Murphy',
      email: 'daniel.murphy@harbourins.example',
      mobile: '0413826758',
      registeredAt: '2026-10-24T19:09:00+11:00',
      status: 'Accepted',
    })
  })

  it('tolerates missing columns', () => {
    const registration = toRegistration({})
    expect(registration.eventId).toBeNull()
    expect(registration.status).toBeNull()
    expect(registration.registrationId).toBe('')
  })
})

describe('parseRegistrations', () => {
  it('parses CSV text into registrations', () => {
    const csv =
      'registration_id,event,first_name,last_name,email,company,job_title,mobile,registered_at,status\n' +
      'R1,E125 Identity Leaders Roundtable SYD,Ann,Lee,,Co,CTO,0400000000,2026-10-01T09:00:00+11:00,Pending\n'
    const [registration] = parseRegistrations(csv)
    expect(registration.eventId).toBe('E125')
    expect(registration.status).toBe('Pending')
  })
})
