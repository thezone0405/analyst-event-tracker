import type { ChangeEvent, ReactElement } from 'react'
import { Dashboard } from './components/Dashboard'
import { useDashboardData, type DashboardDataState } from './hooks/useDashboardData'
import type { Fetcher } from './services/loadDashboardData'

export interface AppProps {
  /** Injectable for tests; defaults to the browser fetch. */
  fetcher?: Fetcher
  /** Polling interval override (ms); defaults to 60 seconds. */
  pollIntervalMs?: number
}

type StateOf<S extends DashboardDataState['status']> = Extract<DashboardDataState, { status: S }>

const STATUS_VIEWS: {
  [S in DashboardDataState['status']]: (state: StateOf<S>) => ReactElement
} = {
  loading: () => (
    <p role="status" className="text-slate-600">
      Loading registration data…
    </p>
  ),
  error: (state) => (
    <p role="alert" className="rounded-md bg-rose-50 p-3 text-rose-800">
      Could not load dashboard data: {state.message}
    </p>
  ),
  ready: (state) => <Dashboard events={state.events} registrations={state.registrations} />,
}

interface StatusViewProps {
  state: DashboardDataState
}

function StatusView({ state }: StatusViewProps) {
  const render = STATUS_VIEWS[state.status] as (state: DashboardDataState) => ReactElement
  return render(state)
}

interface SyncStatusProps {
  state: StateOf<'ready'>
}

function SyncStatus({ state }: SyncStatusProps) {
  return (
    <p className="text-xs text-slate-500" data-testid="sync-status">
      <span data-testid="last-synced">Last synced: {state.lastSynced.toLocaleTimeString()}</span>
      {' · '}
      <span data-testid="data-source">
        {state.uploadedFileName === null
          ? 'Live data (auto-refreshes every 60 seconds)'
          : `Loaded file: ${state.uploadedFileName} (auto-refresh paused)`}
      </span>
    </p>
  )
}

interface UploadControlProps {
  onFile: (file: File) => void
}

function UploadControl({ onFile }: UploadControlProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) onFile(file)
    event.target.value = ''
  }
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-indigo-600 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50">
      Upload New CSV
      <input type="file" accept=".csv,text/csv" className="sr-only" onChange={handleChange} />
    </label>
  )
}

function App({ fetcher, pollIntervalMs }: AppProps) {
  const { state, notice, uploadCsv } = useDashboardData(fetcher, pollIntervalMs)

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 bg-slate-50 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4 text-left">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Event Registration Tracker</h1>
          <p className="text-sm text-slate-600">
            Live CSV registrations reconciled with the nightly event schedule.
          </p>
          {state.status === 'ready' && <SyncStatus state={state} />}
        </div>
        {state.status === 'ready' && <UploadControl onFile={(file) => void uploadCsv(file)} />}
      </header>

      {notice !== null && (
        <p role="alert" className="rounded-md bg-amber-50 p-3 text-left text-amber-900">
          {notice}
        </p>
      )}

      <StatusView state={state} />
    </main>
  )
}

export default App
