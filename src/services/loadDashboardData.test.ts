import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_DATA_SOURCES, loadDashboardData, type Fetcher } from './loadDashboardData'

const EVENTS_JSON = JSON.stringify([
  {
    event_id: 'E126',
    name: 'Identity Leaders Roundtable',
    city: 'Melbourne',
    date: '2026-11-19',
    type: 'Roundtable',
    target_registrations: 30,
    current_registrations: 9,
    launched: '2026-10-06',
  },
])

const REGISTRATIONS_CSV = [
  'registration_id,event,first_name,last_name,email,company,job_title,mobile,registered_at,status',
  'R1057,E125 Identity Leaders Roundtable SYD,James,Lopez,james@example.com,Northwind,CTO,+61 427 874 296,2026-10-03T15:22:00+11:00,Accepted',
].join('\n')

function fakeFetcher(responses: Record<string, Response>): Fetcher {
  return vi.fn(async (url: string) => {
    const response = responses[url]
    if (!response) throw new Error(`unexpected url ${url}`)
    return response
  })
}

describe('loadDashboardData', () => {
  it('fetches the schedule and live export from the public root by default', async () => {
    const fetcher = fakeFetcher({
      '/events.json': new Response(EVENTS_JSON),
      '/registrations.csv': new Response(REGISTRATIONS_CSV),
    })

    const data = await loadDashboardData(fetcher)

    expect(fetcher).toHaveBeenCalledWith(DEFAULT_DATA_SOURCES.eventsUrl)
    expect(fetcher).toHaveBeenCalledWith(DEFAULT_DATA_SOURCES.registrationsUrl)
    expect(data.events).toHaveLength(1)
    expect(data.events[0]).toMatchObject({ event_id: 'E126', current_registrations: 9 })
    expect(data.registrations).toHaveLength(1)
    expect(data.registrations[0]).toMatchObject({ registrationId: 'R1057', eventId: 'E125' })
  })

  it('honours custom data source URLs', async () => {
    const fetcher = fakeFetcher({
      '/a.json': new Response(EVENTS_JSON),
      '/b.csv': new Response(REGISTRATIONS_CSV),
    })

    const data = await loadDashboardData(fetcher, { eventsUrl: '/a.json', registrationsUrl: '/b.csv' })

    expect(data.events).toHaveLength(1)
    expect(data.registrations).toHaveLength(1)
  })

  it('rejects with the URL and HTTP status when a file fails to load', async () => {
    const fetcher = fakeFetcher({
      '/events.json': new Response(EVENTS_JSON),
      '/registrations.csv': new Response('missing', { status: 404 }),
    })

    await expect(loadDashboardData(fetcher)).rejects.toThrow(
      'Failed to load /registrations.csv (HTTP 404)',
    )
  })
})
