import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'
import type { Fetcher } from './services/loadDashboardData'

const EVENTS_JSON = JSON.stringify([
  {
    event_id: 'E155',
    name: 'Data Governance Roundtable',
    city: 'Auckland',
    date: '2026-11-12',
    type: 'Roundtable',
    target_registrations: 25,
    current_registrations: null,
    launched: '2026-10-10',
  },
])

const CSV_HEADER =
  'registration_id,event,first_name,last_name,email,company,job_title,mobile,registered_at,status\n'

function fetcherFor(responses: Record<string, Response>): Fetcher {
  return (url) => Promise.resolve(responses[url] ?? new Response('', { status: 404 }))
}

describe('App', () => {
  it('loads the schedule and export, then renders event cards', async () => {
    const fetcher = fetcherFor({
      '/events.json': new Response(EVENTS_JSON),
      '/registrations.csv': new Response(CSV_HEADER),
    })
    render(<App fetcher={fetcher} />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    expect(await screen.findByTestId('event-card-E155')).toBeInTheDocument()
    expect(screen.getByText('No registration data reported')).toBeInTheDocument()
  })

  it('shows an error when a data file fails to load', async () => {
    const fetcher = fetcherFor({ '/events.json': new Response(EVENTS_JSON) })
    render(<App fetcher={fetcher} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Failed to load /registrations.csv (HTTP 404)',
    )
  })
})
