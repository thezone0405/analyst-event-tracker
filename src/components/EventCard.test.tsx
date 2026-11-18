import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { summarizeEvent } from '../services/reconcile'
import { makeEvent, makeRegistration } from '../test/fixtures'
import { evaluateAttention } from '../services/attention'
import {
  BREAKDOWN_UNAVAILABLE_TEXT,
  NO_DATA_TEXT,
  TARGET_MET_TEXT,
  daysRemainingText,
  gapText,
} from './copy'
import { EventCard } from './EventCard'

describe('EventCard live detail (E101)', () => {
  it('shows name, city, date, days remaining, progress, gap and status counts', () => {
    const registrations = [
      ...Array.from({ length: 36 }, (_, i) =>
        makeRegistration({ registrationId: `A${i}`, status: 'Accepted' }),
      ),
      ...Array.from({ length: 2 }, (_, i) =>
        makeRegistration({ registrationId: `P${i}`, status: 'Pending' }),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makeRegistration({ registrationId: `C${i}`, status: 'Cancelled' }),
      ),
    ]
    const summary = summarizeEvent(makeEvent({ date: '2026-11-22' }), registrations, 0)
    const attention = evaluateAttention('2026-11-22', summary.confirmed, summary.target, '2026-11-19')
    render(<EventCard summary={summary} attention={attention} />)

    expect(screen.getByText('Sydney Cloud Security Summit')).toBeInTheDocument()
    expect(screen.getByText(/Sydney · 2026-11-22/)).toBeInTheDocument()
    expect(screen.getByTestId('days-remaining')).toHaveTextContent('3 days remaining')
    expect(screen.getByTestId('progress-text')).toHaveTextContent('36 of 60 target (60%)')
    expect(screen.getByTestId('gap-text')).toHaveTextContent('24 more accepted registrations needed')
    expect(screen.getByTestId('status-Accepted')).toHaveTextContent('36 Accepted')
    expect(screen.getByTestId('status-Pending')).toHaveTextContent('2 Pending')
    expect(screen.getByTestId('status-Cancelled')).toHaveTextContent('5 Cancelled')
  })
})

describe('copy helpers', () => {
  it('formats the gap text', () => {
    expect(gapText(36, 60)).toBe('24 more accepted registrations needed')
    expect(gapText(59, 60)).toBe('1 more accepted registration needed')
    expect(gapText(60, 60)).toBe(TARGET_MET_TEXT)
    expect(gapText(70, 60)).toBe(TARGET_MET_TEXT)
  })

  it('formats days remaining', () => {
    expect(daysRemainingText(-1)).toBe('Event has passed')
    expect(daysRemainingText(0)).toBe('Today')
    expect(daysRemainingText(1)).toBe('1 day remaining')
    expect(daysRemainingText(5)).toBe('5 days remaining')
  })
})

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
    expect(screen.getByTestId('progress-text')).toHaveTextContent('1 of 50 target (2%)')
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
    expect(within(card).getByTestId('progress-text')).toHaveTextContent('9 of 30 target (30%)')
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

    expect(screen.getByTestId('progress-text')).toHaveTextContent('0 of 25 target (0%)')
    expect(screen.getByText(NO_DATA_TEXT)).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '0')
    expect(screen.queryByText(/duplicate/)).not.toBeInTheDocument()
  })
})
