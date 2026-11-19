import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_DATA_SOURCES,
  defaultFetcher,
  loadDashboardData,
  type DashboardData,
  type Fetcher,
} from '../services/loadDashboardData'
import { parseRegistrations } from '../services/parsers'

export const POLL_INTERVAL_MS = 60_000

export const EMPTY_UPLOAD_MESSAGE =
  'We couldn’t find any registrations in that file. Please check it is a registrations CSV export and try again. Your previous data is still shown.'

export const REFRESH_FAILED_MESSAGE =
  'We couldn’t refresh the latest data just now. The last loaded data is still shown.'

export type DashboardDataState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | ({ status: 'ready'; lastSynced: Date; uploadedFileName: string | null } & DashboardData)

export interface DashboardDataApi {
  state: DashboardDataState
  /** Non-fatal, plain-language message (failed upload or refresh); previous data stays visible. */
  notice: string | null
  uploadCsv: (file: File) => Promise<void>
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error loading dashboard data'
}

async function readRegistrations(file: File) {
  try {
    return parseRegistrations(await file.text())
  } catch {
    return []
  }
}

/**
 * Loads the dashboard inputs, re-fetches them every 60 seconds (cache-busted) until a manual CSV
 * upload takes over, and exposes the upload action.
 */
export function useDashboardData(
  fetcher: Fetcher = defaultFetcher,
  intervalMs: number = POLL_INTERVAL_MS,
): DashboardDataApi {
  const [state, setState] = useState<DashboardDataState>({ status: 'loading' })
  const [notice, setNotice] = useState<string | null>(null)
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    loadDashboardData(fetcher).then(
      (data) => {
        if (active) setState({ status: 'ready', lastSynced: new Date(), uploadedFileName: null, ...data })
      },
      (error: unknown) => {
        if (active) setState({ status: 'error', message: errorMessage(error) })
      },
    )
    return () => {
      active = false
    }
  }, [fetcher])

  // Background polling is paused while a manually uploaded file is on screen.
  const polling = uploadedFileName === null
  useEffect(() => {
    if (!polling) return undefined
    let active = true
    const timer = setInterval(() => {
      loadDashboardData(fetcher, DEFAULT_DATA_SOURCES, Date.now()).then(
        (data) => {
          if (!active) return
          setNotice(null)
          setState({ status: 'ready', lastSynced: new Date(), uploadedFileName: null, ...data })
        },
        () => {
          if (active) setNotice(REFRESH_FAILED_MESSAGE)
        },
      )
    }, intervalMs)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [fetcher, intervalMs, polling])

  const uploadCsv = useCallback(async (file: File) => {
    const parsed = await readRegistrations(file)
    // A row only counts as a registration if it references an event ID.
    const registrations = parsed.filter((registration) => registration.eventId !== null)
    if (registrations.length === 0) {
      setNotice(EMPTY_UPLOAD_MESSAGE)
      return
    }
    setNotice(null)
    setUploadedFileName(file.name)
    setState((current) =>
      current.status === 'ready'
        ? { ...current, registrations, lastSynced: new Date(), uploadedFileName: file.name }
        : current,
    )
  }, [])

  return { state, notice, uploadCsv }
}
