import type { PrioritizedEvent } from './attention'

export interface DashboardKpis {
  upcomingConfirmedSeats: number
  eventsNeedingAttention: number
  pendingReview: number
  duplicates: number
}

/** Aggregates the headline KPI figures from prioritized events and the duplicate count. */
export function computeKpis(items: readonly PrioritizedEvent[], duplicateCount: number): DashboardKpis {
  return {
    upcomingConfirmedSeats: items
      .filter(({ attention }) => attention.daysRemaining >= 0)
      .reduce((sum, { summary }) => sum + summary.confirmed, 0),
    eventsNeedingAttention: items.filter(({ attention }) => attention.needsAttention).length,
    pendingReview: items.reduce((sum, { summary }) => sum + (summary.breakdown?.Pending ?? 0), 0),
    duplicates: duplicateCount,
  }
}
