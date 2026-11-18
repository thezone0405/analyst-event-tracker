import type { DashboardKpis } from '../services/kpis'

export interface KpiCardsProps {
  kpis: DashboardKpis
}

interface KpiDefinition {
  key: keyof DashboardKpis
  label: string
  hint: string
  accent: string
}

const KPI_DEFINITIONS: readonly KpiDefinition[] = [
  { key: 'upcomingConfirmedSeats', label: 'Upcoming Confirmed Seats', hint: 'Accepted seats across upcoming events', accent: 'text-emerald-700' },
  { key: 'eventsNeedingAttention', label: 'Events Needing Attention', hint: 'Behind target and close to the event date', accent: 'text-red-700' },
  { key: 'pendingReview', label: 'Pending Review (CSV)', hint: 'Registrations awaiting a decision', accent: 'text-amber-700' },
  { key: 'duplicates', label: 'Data Hygiene (Duplicates)', hint: 'Duplicate submissions filtered out', accent: 'text-indigo-700' },
]

/** Top-level KPI cards summarising registration health. */
export function KpiCards({ kpis }: KpiCardsProps) {
  return (
    <section aria-label="Key metrics" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {KPI_DEFINITIONS.map(({ key, label, hint, accent }) => (
        <div
          key={key}
          data-testid={`kpi-${key}`}
          className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className={`text-3xl font-bold ${accent}`} data-testid={`kpi-value-${key}`}>
            {kpis[key]}
          </p>
          <p className="text-xs text-slate-500">{hint}</p>
        </div>
      ))}
    </section>
  )
}
