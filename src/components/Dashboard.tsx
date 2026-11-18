import { useMemo, useState } from 'react'
import { prioritize, todayIso } from '../services/attention'
import { reconcile } from '../services/reconcile'
import type { EventRecord, Registration } from '../types'
import { EventCard } from './EventCard'

export interface DashboardProps {
  events: EventRecord[]
  registrations: Registration[]
  /** Reference date (YYYY-MM-DD); defaults to the current local date. */
  today?: string
}

/** Reconciles live registrations against the master schedule and renders one card per event. */
export function Dashboard({ events, registrations, today = todayIso() }: DashboardProps) {
  const [dedupeActive, setDedupeActive] = useState(true)
  const result = useMemo(
    () => reconcile(events, registrations, { deduplicate: dedupeActive }),
    [events, registrations, dedupeActive],
  )

  const prioritized = useMemo(() => prioritize(result.summaries, today), [result.summaries, today])
  const urgent = prioritized.filter((item) => item.attention.needsAttention)

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-label="Ingestion summary"
        className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4"
      >
        <dl className="flex flex-wrap gap-6 text-left">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Live rows</dt>
            <dd className="text-xl font-semibold text-slate-900">{registrations.length}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Duplicate submissions filtered</dt>
            <dd className="text-xl font-semibold text-slate-900" data-testid="duplicate-count">
              {result.duplicateCount}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Unmatched rows</dt>
            <dd className="text-xl font-semibold text-slate-900" data-testid="unmatched-count">
              {result.unmatchedRows.length}
            </dd>
          </div>
        </dl>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 accent-indigo-600"
            checked={dedupeActive}
            onChange={(event) => setDedupeActive(event.target.checked)}
          />
          Filter duplicate submissions
        </label>
      </section>

      {urgent.length > 0 && (
        <section
          aria-label="Action Required"
          data-testid="action-required"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-left"
        >
          <h2 className="text-base font-semibold text-red-900">Action Required</h2>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-red-800">
            {urgent.map(({ summary, attention }) => (
              <li key={summary.event.event_id} data-testid={`action-item-${summary.event.event_id}`}>
                {summary.event.event_id} · {summary.event.name} — {attention.badge} ({attention.percent}%,{' '}
                {attention.daysRemaining} days left)
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Events" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {prioritized.map(({ summary, attention }) => (
          <EventCard key={summary.event.event_id} summary={summary} attention={attention} />
        ))}
      </section>
    </div>
  )
}
