import { useEffect, useState } from 'react'
import {
  defaultFetcher,
  loadDashboardData,
  type DashboardData,
  type Fetcher,
} from '../services/loadDashboardData'

export type DashboardDataState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | ({ status: 'ready' } & DashboardData)

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error loading dashboard data'
}

/** Fetches the dashboard inputs once per fetcher; ignores results after unmount. */
export function useDashboardData(fetcher: Fetcher = defaultFetcher): DashboardDataState {
  const [state, setState] = useState<DashboardDataState>({ status: 'loading' })

  useEffect(() => {
    let active = true
    loadDashboardData(fetcher).then(
      (data) => {
        if (active) setState({ status: 'ready', ...data })
      },
      (error: unknown) => {
        if (active) setState({ status: 'error', message: errorMessage(error) })
      },
    )
    return () => {
      active = false
    }
  }, [fetcher])

  return state
}
