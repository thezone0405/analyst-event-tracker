import { REGISTRATION_STATUSES, type RegistrationStatus, type StatusCounts } from '../types'

export interface StatusBreakdownProps {
  counts: StatusCounts
}

const STATUS_STYLES: Record<RegistrationStatus, string> = {
  Accepted: 'bg-emerald-50 text-emerald-800',
  Pending: 'bg-amber-50 text-amber-800',
  Cancelled: 'bg-rose-50 text-rose-800',
}

/** Per-status registration counts from the live export. */
export function StatusBreakdown({ counts }: StatusBreakdownProps) {
  return (
    <dl className="grid grid-cols-3 gap-2" aria-label="Registration status breakdown">
      {REGISTRATION_STATUSES.map((status) => (
        <div key={status} className={`rounded-md px-2 py-1 text-center ${STATUS_STYLES[status]}`}>
          <dt className="sr-only">{status}</dt>
          <dd className="text-sm font-semibold" data-testid={`status-${status}`}>
            {counts[status]} {status}
          </dd>
        </div>
      ))}
    </dl>
  )
}
