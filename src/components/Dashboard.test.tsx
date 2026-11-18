import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makeEvent, makeRegistration } from '../test/fixtures'
import { Dashboard } from './Dashboard'

const events = [
  makeEvent({ event_id: 'E101', target_registrations: 60 }),
  makeEvent({ event_id: 'E126', target_registrations: 30, current_registrations: 9 }),
]

const arjun = {
  eventId: 'E101',
  firstName: 'Arjun',
  lastName: 'Nguyen',
  mobile: '0483930103',
  registeredAt: '2026-10-11T09:32:00+11:00',
}

const registrations = [
  makeRegistration({ ...arjun, registrationId: 'R1012' }),
  makeRegistration({ ...arjun, registrationId: 'R1312', mobile: '+61 483 930 103' }),
  makeRegistration({ registrationId: 'R9', eventId: 'E999', mobile: '0411111111' }),
]

describe('Dashboard', () => {
  it('filters duplicate submissions by default and renders a card per event', () => {
    render(<Dashboard events={events} registrations={registrations} />)

    expect(screen.getByTestId('duplicate-count')).toHaveTextContent('1')
    expect(screen.getByTestId('unmatched-count')).toHaveTextContent('1')
    expect(screen.getByTestId('event-card-E101')).toBeInTheDocument()
    expect(screen.getByTestId('event-card-E126')).toBeInTheDocument()
    expect(screen.getAllByTestId('status-Accepted')[0]).toHaveTextContent('1')
  })

  it('counts every row when duplicate filtering is switched off', () => {
    render(<Dashboard events={events} registrations={registrations} />)

    const toggle = screen.getByRole('checkbox', { name: 'Filter duplicate submissions' })
    expect(toggle).toBeChecked()
    fireEvent.click(toggle)

    expect(toggle).not.toBeChecked()
    expect(screen.getByTestId('duplicate-count')).toHaveTextContent('0')
    expect(screen.getAllByTestId('status-Accepted')[0]).toHaveTextContent('2')
  })
})

describe('Dashboard action required banner', () => {
  it('lists urgent events and excludes completed ones', () => {
    const evs = [
      makeEvent({ event_id: 'E130', date: '2026-11-19', target_registrations: 25, current_registrations: 4 }),
      makeEvent({ event_id: 'E114', date: '2026-11-10', target_registrations: 45, current_registrations: 42 }),
    ]
    render(<Dashboard events={evs} registrations={[]} today="2026-11-16" />)

    expect(screen.getByTestId('action-item-E130')).toBeInTheDocument()
    expect(screen.queryByTestId('action-item-E114')).not.toBeInTheDocument()
    expect(screen.getByTestId('attention-badge-E114')).toHaveTextContent('Completed')
  })
})
