import type { EventSummary, SummarySource } from '../types'
import { BREAKDOWN_UNAVAILABLE_TEXT, NO_DATA_TEXT } from './copy'
import { ProgressBar } from './ProgressBar'
import { StatusBreakdown } from './StatusBreakdown'

export interface EventCardProps {
  summary: EventSummary
}

const SOURCE_BADGES: Record<SummarySource, { label: string; className: string }> = {
  live: { label: 'Live CSV', className: 'bg-indigo-100 text-indigo-800' },
  snapshot: { label: 'Nightly snapshot', className: 'bg-slate-100 text-slate-700' },
  none: { label: 'No data', className: 'bg-amber-100 text-amber-800' },
}

function StatusDetail({ summary }: EventCardProps) {
  if (summary.breakdown) {
    return <StatusBreakdown counts={summary.breakdown} />
  }
  if (summary.source === 'snapshot') {
    return <p className="text-sm italic text-slate-500">{BREAKDOWN_UNAVAILABLE_TEXT}</p>
  }
  return (
    <p className="rounded-md bg-amber-50 px-2 py-1 text-sm font-medium text-amber-800">
      {NO_DATA_TEXT}
    </p>
  )
}

interface DuplicateNoteProps {
  count: number
}

function pluralizeSubmission(count: number): string {
  return count === 1 ? 'submission' : 'submissions'
}

/** Notes how many duplicate submissions were filtered; renders nothing when there were none. */
function DuplicateNote({ count }: DuplicateNoteProps) {
  if (count <= 0) return null
  return (
    <p className="text-xs text-slate-500">
      {count} duplicate {pluralizeSubmission(count)} filtered
    </p>
  )
}

/** Summary card for one scheduled event. */
export function EventCard({ summary }: EventCardProps) {
  const { event, source, confirmed, target, percent, duplicatesFiltered } = summary
  const badge = SOURCE_BADGES[source]

  return (
    <article
      aria-labelledby={`event-${event.event_id}-title`}
      data-testid={`event-card-${event.event_id}`}
      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm"
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-xs text-slate-500">{event.event_id}</p>
          <h2 id={`event-${event.event_id}-title`} className="text-base font-semibold text-slate-900">
            {event.name}
          </h2>
          <p className="text-sm text-slate-600">
            {event.city} · {event.date}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
          {badge.label}
        </span>
      </header>

      <ProgressBar
        value={confirmed}
        max={target}
        percent={percent}
        label={`${event.event_id} confirmed registrations`}
      />

      <StatusDetail summary={summary} />

      <DuplicateNote count={duplicatesFiltered} />
    </article>
  )
}
