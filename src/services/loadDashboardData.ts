import type { EventRecord, Registration } from '../types'
import { parseEvents, parseRegistrations } from './parsers'

export interface DataSources {
  eventsUrl: string
  registrationsUrl: string
}

/** Files live in `public/` and are served from the site root by Vite/Vercel. */
export const DEFAULT_DATA_SOURCES: DataSources = {
  eventsUrl: '/events.json',
  registrationsUrl: '/registrations.csv',
}

export type Fetcher = (url: string) => Promise<Response>

export const defaultFetcher: Fetcher = (url) => fetch(url)

export interface DashboardData {
  events: EventRecord[]
  registrations: Registration[]
}

async function fetchText(fetcher: Fetcher, url: string): Promise<string> {
  const response = await fetcher(url)
  if (!response.ok) {
    throw new Error(`Failed to load ${url} (HTTP ${response.status})`)
  }
  return response.text()
}

/** Loads and parses the master schedule and live registration export. */
export async function loadDashboardData(
  fetcher: Fetcher = defaultFetcher,
  sources: DataSources = DEFAULT_DATA_SOURCES,
): Promise<DashboardData> {
  const [eventsText, registrationsText] = await Promise.all([
    fetchText(fetcher, sources.eventsUrl),
    fetchText(fetcher, sources.registrationsUrl),
  ])
  return {
    events: parseEvents(JSON.parse(eventsText)),
    registrations: parseRegistrations(registrationsText),
  }
}
