import { Dashboard } from './components/Dashboard'
import { useDashboardData } from './hooks/useDashboardData'
import type { Fetcher } from './services/loadDashboardData'

export interface AppProps {
  /** Injectable for tests; defaults to the browser fetch. */
  fetcher?: Fetcher
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

      {state.status === 'loading' && (
        <p role="status" className="text-slate-600">
          Loading registration data…
        </p>
      )}
      {state.status === 'error' && (
        <p role="alert" className="rounded-md bg-rose-50 p-3 text-rose-800">
          Could not load dashboard data: {state.message}
        </p>
      )}
      {state.status === 'ready' && (
        <Dashboard events={state.events} registrations={state.registrations} />
      )}
    </main>
  )
}

export default App
