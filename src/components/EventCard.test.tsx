import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { summarizeEvent } from '../services/reconcile'
import { makeEvent, makeRegistration } from '../test/fixtures'
import { BREAKDOWN_UNAVAILABLE_TEXT, NO_DATA_TEXT } from './copy'
import { EventCard } from './EventCard'

describe('EventCard', () => {
  it('shows the live status breakdown and confirmed progress', () => {
    const summary = summarizeEvent(
      makeEvent({ event_id: 'E125', target_registrations: 50 }),
      [
        makeRegistration({ status: 'Accepted' }),
        makeRegistration({ status: 'Pending' }),
        makeRegistration({ status: 'Cancelled' }),
      ],
      1,
    )
    render(<EventCard summary={summary} />)

    expect(screen.getByTestId('status-Accepted')).toHaveTextContent('1')
    expect(screen.getByTestId('status-Pending')).toHaveTextContent('1')
    expect(screen.getByTestId('status-Cancelled')).toHaveTextContent('1')
    expect(screen.getByTestId('progress-text')).toHaveTextContent('1 of 50 (2%)')
    expect(screen.getByText('Live CSV')).toBeInTheDocument()
    expect(screen.getByText(/1 duplicate submission\s+filtered/)).toBeInTheDocument()
  })

  it('falls back to the nightly snapshot for E126 without showing 0 for Pending/Cancelled', () => {
    const summary = summarizeEvent(
      makeEvent({
        event_id: 'E126',
        name: 'Identity Leaders Roundtable',
        city: 'Melbourne',
        target_registrations: 30,
        current_registrations: 9,
      }),
      [],
    )
    render(<EventCard summary={summary} />)

    const card = screen.getByTestId('event-card-E126')
    expect(within(card).getByTestId('progress-text')).toHaveTextContent('9 of 30 (30%)')
    expect(within(card).getByText(BREAKDOWN_UNAVAILABLE_TEXT)).toBeInTheDocument()
    expect(within(card).queryByTestId('status-Pending')).not.toBeInTheDocument()
    expect(within(card).queryByTestId('status-Cancelled')).not.toBeInTheDocument()
    expect(within(card).getByText('Nightly snapshot')).toBeInTheDocument()
  })

  it('defaults E155 to 0 of 25 (0%) with a "No registration data reported" label', () => {
    const summary = summarizeEvent(
      makeEvent({ event_id: 'E155', target_registrations: 25, current_registrations: null }),
      [],
    )
    render(<EventCard summary={summary} />)

    expect(screen.getByTestId('progress-text')).toHaveTextContent('0 of 25 (0%)')
    expect(screen.getByText(NO_DATA_TEXT)).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '0')
    expect(screen.queryByText(/duplicate/)).not.toBeInTheDocument()
  })
})
