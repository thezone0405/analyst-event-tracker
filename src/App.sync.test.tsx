import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  {
    event_id: 'E200',
    name: 'Future Summit',
    city: 'Sydney',
    date: '2099-01-01',
    type: 'Summit',
    target_registrations: 50,
    current_registrations: 5,
    launched: '2026-10-10',
  },
])

const HEADER = 'registration_id,event,first_name,last_name,email,company,job_title,mobile,registered_at,status\n'
const ROW = (id: string) =>
  `${id},E155 - Data Governance Roundtable,A,B,${id}@x.com,,,04${id.slice(-2)}00000,2026-10-11T09:00:00+11:00,Accepted\n`

function makeFetcher(csv: () => string) {
  const urls: string[] = []
  const fetcher: Fetcher = (url) => {
    urls.push(url)
    const path = url.split('?')[0]
    if (path === '/events.json') return Promise.resolve(new Response(EVENTS_JSON))
    return Promise.resolve(new Response(csv()))
  }
  return { fetcher, urls }
}

describe('live sync and manual upload', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('re-fetches with cache-busting every 60 seconds and updates Last synced', async () => {
    let csv = HEADER + ROW('R1001')
    const { fetcher, urls } = makeFetcher(() => csv)
    render(<App fetcher={fetcher} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(screen.getByTestId('status-Accepted')).toHaveTextContent('1')
    const before = screen.getByTestId('last-synced').textContent

    csv = HEADER + ROW('R1001') + ROW('R1002')
    vi.setSystemTime(Date.now() + 60_000)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })

    expect(urls.some((u) => /^\/events\.json\?_=\d+$/.test(u))).toBe(true)
    expect(urls.some((u) => /^\/registrations\.csv\?_=\d+$/.test(u))).toBe(true)
    expect(screen.getByTestId('status-Accepted')).toHaveTextContent('2')
    expect(screen.getByTestId('last-synced').textContent).not.toBe(before)
  })

  it('keeps data and shows a notice when a background refresh fails', async () => {
    let fail = false
    const fetcher: Fetcher = (url) =>
      fail
        ? Promise.resolve(new Response('', { status: 500 }))
        : Promise.resolve(new Response(url.startsWith('/events.json') ? EVENTS_JSON : HEADER + ROW('R1001')))
    render(<App fetcher={fetcher} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    fail = true
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(screen.getByRole('alert')).toHaveTextContent('last loaded data is still shown')
    expect(screen.getByTestId('event-card-E155')).toBeInTheDocument()
  })

  it('shows the uploaded filename and pauses polling', async () => {
    const { fetcher, urls } = makeFetcher(() => HEADER + ROW('R1001'))
    render(<App fetcher={fetcher} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    const input = screen.getByLabelText('Upload New CSV')
    const file = new File([HEADER + ROW('R2001') + ROW('R2002') + ROW('R2003')], 'registrations-latest.csv', {
      type: 'text/csv',
    })
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(screen.getByTestId('data-source')).toHaveTextContent('registrations-latest.csv')
    expect(screen.getByTestId('status-Accepted')).toHaveTextContent('3')

    const callsBefore = urls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000)
    })
    expect(urls.length).toBe(callsBefore)
    expect(screen.getByTestId('status-Accepted')).toHaveTextContent('3')
  })

  it('rejects an empty upload with a friendly banner and keeps existing data', async () => {
    const { fetcher } = makeFetcher(() => HEADER + ROW('R1001'))
    render(<App fetcher={fetcher} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    const file = new File([''], 'empty.csv', { type: 'text/csv' })
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Upload New CSV'), { target: { files: [file] } })
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(screen.getByRole('alert')).toHaveTextContent('couldn’t find any registrations')
    expect(screen.getByTestId('event-card-E155')).toBeInTheDocument()
    expect(screen.getByTestId('data-source')).not.toHaveTextContent('empty.csv')
  })

  it('filters event cards by tab and highlights the active tab', async () => {
    const { fetcher } = makeFetcher(() => HEADER + ROW('R1001'))
    render(<App fetcher={fetcher} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Completed' }))
    expect(screen.getByRole('button', { name: 'Completed' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('event-card-E155')).toBeInTheDocument()
    expect(screen.queryByTestId('event-card-E200')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Live CSV Tracked' }))
    expect(screen.getByTestId('event-card-E155')).toBeInTheDocument()
    expect(screen.queryByTestId('event-card-E200')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Needs Attention' }))
    expect(screen.queryByTestId('event-card-E155')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'All Events' }))
    expect(screen.getByTestId('event-card-E200')).toBeInTheDocument()
  })

  it('flags the Data Hygiene card when duplicates are included', async () => {
    const { fetcher } = makeFetcher(() => HEADER + ROW('R1001'))
    render(<App fetcher={fetcher} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Remove duplicate submissions' }))
    expect(screen.getByTestId('kpi-duplicates')).toHaveTextContent('Duplicates currently included')
  })
})
