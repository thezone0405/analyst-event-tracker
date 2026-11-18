import type { EventRecord, Registration } from '../types'

export function makeEvent(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    event_id: 'E101',
    name: 'Sydney Cloud Security Summit',
    city: 'Sydney',
    date: '2026-11-19',
    type: 'Summit',
    target_registrations: 60,
    current_registrations: 42,
    launched: '2026-08-20',
    ...overrides,
  }
}

export function makeRegistration(overrides: Partial<Registration> = {}): Registration {
  return {
    registrationId: 'R0001',
    eventId: 'E101',
    eventLabel: 'E101 Sydney Cloud Security Summit',
    firstName: 'Test',
    lastName: 'Person',
    email: 'test.person@example.com',
    mobile: '0400000000',
    registeredAt: '2026-10-01T09:00:00+11:00',
    status: 'Accepted',
    ...overrides,
  }
}
