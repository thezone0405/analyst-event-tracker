export const BREAKDOWN_UNAVAILABLE_TEXT =
  'Accepted, Pending and Cancelled breakdowns are unavailable — showing the nightly snapshot count.'

export const NO_DATA_TEXT = 'No registration data reported'

export const TARGET_MET_TEXT = 'Target reached'

/** Remaining-gap sentence for a card, e.g. "24 more accepted registrations needed". */
export function gapText(confirmed: number, target: number): string {
  const gap = target - confirmed
  if (gap <= 0) return TARGET_MET_TEXT
  return `${gap} more accepted ${gap === 1 ? 'registration' : 'registrations'} needed`
}

/** Human days-remaining label; past events are described as already held. */
export function daysRemainingText(days: number): string {
  if (days < 0) return 'Event has passed'
  if (days === 0) return 'Today'
  return `${days} ${days === 1 ? 'day' : 'days'} remaining`
}
