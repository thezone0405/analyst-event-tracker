import type { ReactElement } from 'react'
import { Dashboard } from './components/Dashboard'
import { useDashboardData, type DashboardDataState } from './hooks/useDashboardData'
import type { Fetcher } from './services/loadDashboardData'

export interface AppProps {
  /** Injectable for tests; defaults to the browser fetch. */
  fetcher?: Fetcher
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

function App({ fetcher }: AppProps) {
  const state = useDashboardData(fetcher)

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 bg-slate-50 p-6">
      <header className="text-left">
        <h1 className="text-2xl font-bold text-slate-900">Event Registration Tracker</h1>
        <p className="text-sm text-slate-600">
          Live CSV registrations reconciled with the nightly event schedule.
        </p>
      </header>

      <StatusView state={state} />
    </main>
  )
}

export default App
